import {
  COINTYPE_ETC,
  COINTYPE_ETH,
  INDEX_PLACEHOLDER,
} from '@onekeyhq/shared/src/engine/engineConsts';

import type {
  IAccountDeriveInfo,
  IAccountDeriveInfoMapBase,
  IVaultSettings,
} from '../../types';

export type IAccountDeriveInfoMapEvm = IAccountDeriveInfoMapBase & {
  default: IAccountDeriveInfo;
  etcNative: IAccountDeriveInfo;
  ledgerLive: IAccountDeriveInfo;
};
export type IAccountDeriveTypesEvm = keyof IAccountDeriveInfoMapEvm;

const settings: IVaultSettings = {
  importedAccountEnabled: true,
  hardwareAccountEnabled: true,
  externalAccountEnabled: true,
  watchingAccountEnabled: true,
  purposes: [44], // TODO move to accountDeriveInfo?
  accountDeriveInfo: {
    default: {
      // category: `44'/${COINTYPE_ETH}'`,
      namePrefix: 'EVM',
      labelKey: 'form__bip44_standard',
      template: `m/44'/${COINTYPE_ETH}'/0'/0/${INDEX_PLACEHOLDER}`,
      coinType: COINTYPE_ETH,
    },
    etcNative: {
      // category: `44'/${COINTYPE_ETH}'`,
      namePrefix: 'ETC-Native',
      labelKey: 'form__bip44_standard_cointype_61',
      template: `m/44'/${COINTYPE_ETC}'/0'/0/${INDEX_PLACEHOLDER}`,
      coinType: COINTYPE_ETC,
      // ETC only, hide in other EVM chains
      enableConditions: [
        {
          networkId: ['evm--61'], // ETC
        },
      ],
    },
    ledgerLive: {
      // category: `44'/${COINTYPE_ETH}'`,
      namePrefix: 'Ledger Live',
      label: 'Ledger Live',
      idSuffix: 'LedgerLive', // hd-1--m/44'/60'/0'/0/0--LedgerLive
      template: `m/44'/${COINTYPE_ETH}'/${INDEX_PLACEHOLDER}'/0/0`,
      coinType: COINTYPE_ETH,
    },
  } as IAccountDeriveInfoMapEvm,
};

export default Object.freeze(settings);
