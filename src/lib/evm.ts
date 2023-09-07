import type { LinkSession } from "anchor-link";
import { BN } from "bn.js";
import { ethers } from "ethers";

export interface EvmChainConfig {
    chainId: string
    chainName: string
    nativeCurrency: {name: string; symbol: string; decimals: number}
    rpcUrls: string[]
    blockExplorerUrls: string[]
}

let evmProvider: ethers.providers.Web3Provider

declare global {
    interface Window {
        ethereum: any
    }
}

interface EvmAccountParams {
    signer: ethers.providers.JsonRpcSigner
    address: string
    chainName: string
}

const evmChainConfigs: {[key: string]: EvmChainConfig} = {
    'eos-mainnet': {
        chainId: '0x4571',
        chainName: 'EOS EVM Network',
        nativeCurrency: {name: 'EOS', symbol: '4,EOS', decimals: 18},
        rpcUrls: ['https://api.evm.eosnetwork.com/'],
        blockExplorerUrls: ['https://explorer.evm.eosnetwork.com'],
    },
    'telos': {
        chainId: '40(0x28)',
        chainName: 'Telos EVM Network',
        nativeCurrency: {name: 'TLOS', symbol: '4,TLOS', decimals: 18},
        rpcUrls: ['https://mainnet.telos.net/evm'],
        blockExplorerUrls: ['https://www.teloscan.io/'],
    },
}

export function getProvider() {
    if (evmProvider) {
        return evmProvider
    }

    if (window.ethereum) {
        evmProvider = new ethers.providers.Web3Provider(window.ethereum)
        return evmProvider
    }

    throw new Error('No provider found')
}

export class EvmAccount {
    address: string
    signer: ethers.providers.JsonRpcSigner
    chainName: string

    constructor({address, signer, chainName}: EvmAccountParams) {
        this.address = address
        this.signer = signer
        this.chainName = chainName
    }

    get chainConfig() {
        return evmChainConfigs[this.chainName]
    }

    static from(EvmAccountParams: EvmAccountParams) {
        // Implement your logic here
        return new EvmAccount(EvmAccountParams)
    }

    async sendTransaction(tx: ethers.providers.TransactionRequest) {
        return this.signer.sendTransaction(tx)
    }

    async getBalance() {
        const wei = await this.signer.getBalance()

        const tokenName = evmChainConfigs[this.chainName].nativeCurrency.name

        return formatToken(ethers.utils.formatEther(wei), tokenName)
    }
}

export function convertToEvmAddress(eosAccountName: string): string {
    const blockList = ['binancecleos', 'huobideposit', 'okbtothemoon']
    if (blockList.includes(eosAccountName)) {
        throw new Error('This CEX has not fully support the EOS-EVM bridge yet.')
    }
    return convertToEthAddress(eosAccountName)
}

function convertToEthAddress(eosAddress: string) {
    try {
        return uint64ToAddr(strToUint64(eosAddress))
    } catch (err) {
        return err
    }
}

function charToSymbol(c: string) {
    const a = 'a'.charCodeAt(0)
    const z = 'z'.charCodeAt(0)
    const one = '1'.charCodeAt(0)
    const five = '5'.charCodeAt(0)
    const charCode = c.charCodeAt(0)
    if (charCode >= a && charCode <= z) {
        return charCode - a + 6
    }
    if (charCode >= one && charCode <= five) {
        return charCode - one + 1
    }
    if (c === '.') {
        return 0
    }
    throw new Error('Address include illegal character')
}

function strToUint64(str: string) {
    var n = new BN(0)
    var i = str.length
    if (i >= 13) {
        // Only the first 12 characters can be full-range ([.1-5a-z]).
        i = 12

        // The 13th character must be in the range [.1-5a-j] because it needs to be encoded
        // using only four bits (64_bits - 5_bits_per_char * 12_chars).
        n = new BN(charToSymbol(str[12]))
        if (n.gte(new BN(16))) {
            throw new Error('Invalid 13th character')
        }
    }
    // Encode full-range characters.

    while (--i >= 0) {
        n = n.or(new BN(charToSymbol(str[i])).shln(64 - 5 * (i + 1)))
    }
    return n.toString(16, 16)
}

function uint64ToAddr(str: string) {
    return '0xbbbbbbbbbbbbbbbbbbbbbbbb' + str
}

export interface TransferParams {
    amount: string
    evmAccount: EvmAccount
    nativeSession: LinkSession
}

function formatToken(amount: String, tokenSymbol: String) {
    return `${Number(amount).toFixed(4)} ${tokenSymbol}`
}

export async function connectEvmWallet(chainName: string): Promise<EvmAccount> {
    if (window.ethereum) {
        const provider = getProvider()
        let networkId = await provider.getNetwork()
        if (networkId.chainId !== 17777) {
            await switchNetwork(chainName)
            networkId = await provider.getNetwork()
        }

        await window.ethereum.request({method: 'eth_requestAccounts'})
        const signer = provider.getSigner()

        await window.ethereum.get_currency_balance

        return EvmAccount.from({
            address: await signer.getAddress(),
            signer,
            chainName,
        })
    } else {
        throw 'You need to install Metamask in order to use this feature.'
    }
}

async function switchNetwork(chainName: string) {
    const evmNodeConfig = evmChainConfigs[chainName]
    console.log({evmNodeConfig})
    await window.ethereum
        .request({
            method: 'wallet_switchEthereumChain',
            params: [{chainId: evmNodeConfig.chainId}],
        })
        .catch(async (e: {code: number}) => {
            if (e.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [
                        evmNodeConfig
                    ],
                })
            }
        })
}

export async function estimateGas({nativeSession, evmAccount, amount}: TransferParams) {
    const provider = getProvider()

    const targetEvmAddress = convertToEvmAddress(String(nativeSession.auth.actor))

    const gasPrice = await provider.getGasPrice()

    // Reducing the amount by 0.005 EOS to avoid getting an error when entire balance is sent. Proper amount is calculated once the gas fee is known.
    const reducedAmount = String(Number(amount) - 0.005)

    const gas = await provider.estimateGas({
        from: evmAccount.address,
        to: targetEvmAddress,
        value: ethers.utils.parseEther(reducedAmount),
        gasPrice,
        data: ethers.utils.formatBytes32String(''),
    })

    return {gas, gasPrice}
}