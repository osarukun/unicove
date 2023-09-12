import {Asset, Name} from 'anchor-link'
import {Transfer} from '~/abi-types'
import {getClient} from '~/api-client'
import { TransferManager } from './transferManager'
import { getCurrentAccountBalance } from '~/store'

export class EosEvmBridge extends TransferManager {
    static from = 'eos'
    static fromDisplayString = 'EOS'
    static to = 'evm'
    static toDisplayString = 'EOS (EVM)'
    static supportedChains = ['eos']

    async transferFee() {
        const apiClient = getClient(this.nativeSession.chainId)

        let apiResponse
    
        try {
            apiResponse = await apiClient.v1.chain.get_table_rows({
                code: 'eosio.evm',
                scope: 'eosio.evm',
                table: 'config',
            })
        } catch (err) {
            throw new Error('Failed to get config table from eosio.evm. Full error: ' + err)
        }
        
        const config = apiResponse.rows[0]
        
        return Asset.from(config.ingress_bridge_fee || '0.0000 EOS')
    }

    transfer(amount: string) {
        const action = Transfer.from({
            from: this.nativeSession.auth.actor,
            to: 'eosio.evm',
            quantity: String(Asset.fromFloat(Number(amount), '4,EOS')),
            memo: this.evmSession.address,
        })
    
        return this.nativeSession.transact({
            action: {
                authorization: [this.nativeSession.auth],
                account: Name.from('eosio.token'),
                name: Name.from('transfer'),
                data: action,
            },
        })
    }

    async balance() {
        return getCurrentAccountBalance()
    }
}
