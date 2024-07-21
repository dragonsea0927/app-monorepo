import { isNil, unionBy } from 'lodash';

import type { IEncodedTx } from '@onekeyhq/core/src/types';
import type ILightningVault from '@onekeyhq/kit-bg/src/vaults/impls/lightning/Vault';
import {
  backgroundClass,
  backgroundMethod,
} from '@onekeyhq/shared/src/background/backgroundDecorators';
import { getNetworkIdsMap } from '@onekeyhq/shared/src/config/networkIds';
import type { OneKeyServerApiError } from '@onekeyhq/shared/src/errors';
import { EServiceEndpointEnum } from '@onekeyhq/shared/types/endpoint';
import { EOnChainHistoryTxStatus } from '@onekeyhq/shared/types/history';
import type {
  IAccountHistoryTx,
  IAllNetworkHistoryExtraItem,
  IFetchAccountHistoryParams,
  IFetchAccountHistoryResp,
  IFetchHistoryTxDetailsParams,
  IFetchHistoryTxDetailsResp,
  IFetchTxDetailsParams,
} from '@onekeyhq/shared/types/history';
import { ESwapTxHistoryStatus } from '@onekeyhq/shared/types/swap/types';
import { EDecodedTxStatus, EReplaceTxType } from '@onekeyhq/shared/types/tx';
import type {
  IReplaceTxInfo,
  ISendTxOnSuccessData,
} from '@onekeyhq/shared/types/tx';

import simpleDb from '../dbs/simple/simpleDb';
import { vaultFactory } from '../vaults/factory';

import ServiceBase from './ServiceBase';

@backgroundClass()
class ServiceHistory extends ServiceBase {
  constructor({ backgroundApi }: { backgroundApi: any }) {
    super({ backgroundApi });
  }

  @backgroundMethod()
  public async fetchAccountHistory(params: IFetchAccountHistoryParams) {
    const { accountId, networkId, tokenIdOnNetwork } = params;
    const [accountAddress, xpub, vaultSettings] = await Promise.all([
      this.backgroundApi.serviceAccount.getAccountAddressForApi({
        accountId,
        networkId,
      }),
      this.backgroundApi.serviceAccount.getAccountXpub({
        accountId,
        networkId,
      }),
      this.backgroundApi.serviceNetwork.getVaultSettings({
        networkId,
      }),
    ]);

    let onChainHistoryTxs: IAccountHistoryTx[] = [];
    let localHistoryConfirmedTxs: IAccountHistoryTx[] = [];
    let localHistoryPendingTxs: IAccountHistoryTx[] = [];

    // 1. Get the locally pending transactions
    localHistoryPendingTxs = await this.getAccountLocalHistoryPendingTxs({
      networkId,
      accountAddress,
      xpub,
      tokenIdOnNetwork,
    });

    // 2. Check if the locally pending transactions have been confirmed

    // Confirmed transactions
    const confirmedTxs: IAccountHistoryTx[] = [];
    // Transactions still in pending status
    const pendingTxs: IAccountHistoryTx[] = [];

    // Fetch details of locally pending transactions
    const onChainHistoryTxsDetails = await Promise.all(
      localHistoryPendingTxs.map((tx) =>
        this.fetchHistoryTxDetails({
          accountId,
          networkId,
          txid: tx.decodedTx.txid,
        }),
      ),
    );

    for (const localHistoryPendingTx of localHistoryPendingTxs) {
      const confirmedTx = onChainHistoryTxsDetails.find(
        (txDetails) =>
          localHistoryPendingTx.decodedTx.txid === txDetails?.data.tx &&
          (txDetails.data.status === EOnChainHistoryTxStatus.Success ||
            txDetails.data.status === EOnChainHistoryTxStatus.Failed),
      );

      if (confirmedTx) {
        confirmedTxs.push({
          ...localHistoryPendingTx,
          decodedTx: {
            ...localHistoryPendingTx.decodedTx,
            status:
              confirmedTx?.data.status === EOnChainHistoryTxStatus.Success
                ? EDecodedTxStatus.Confirmed
                : EDecodedTxStatus.Failed,
            totalFeeInNative: isNil(confirmedTx.data.gasFee)
              ? localHistoryPendingTx.decodedTx.totalFeeInNative
              : confirmedTx.data.gasFee,
            totalFeeFiatValue: isNil(confirmedTx.data.gasFeeFiatValue)
              ? localHistoryPendingTx.decodedTx.totalFeeFiatValue
              : confirmedTx.data.gasFeeFiatValue,
            isFinal: true,
          },
        });
      } else {
        pendingTxs.push(localHistoryPendingTx);
      }
    }

    // 3. Get the locally confirmed transactions
    localHistoryConfirmedTxs = await this.getAccountLocalHistoryConfirmedTxs({
      networkId,
      accountAddress,
      xpub,
      tokenIdOnNetwork,
    });

    // 4. Fetch the on-chain history
    onChainHistoryTxs = await this.fetchAccountOnChainHistory({
      ...params,
      accountAddress,
      xpub,
    });

    // 5. Merge the just-confirmed transactions, locally confirmed transactions, and on-chain history

    // Merge the locally confirmed transactions and the just-confirmed transactions
    const mergedConfirmedTxs = unionBy(
      [...confirmedTxs, ...localHistoryConfirmedTxs],
      (tx) => tx.id,
    );

    // Merge the merged confirmed transactions with the on-chain history

    // Find transactions confirmed through history details query but not in on-chain history, these need to be saved
    let confirmedTxsToSave: IAccountHistoryTx[] = [];
    let confirmedTxsToRemove: IAccountHistoryTx[] = [];
    if (!vaultSettings.saveConfirmedTxsEnabled) {
      confirmedTxsToSave = mergedConfirmedTxs.filter(
        (tx) =>
          !onChainHistoryTxs.find(
            (onChainHistoryTx) => onChainHistoryTx.id === tx.id,
          ),
      );

      confirmedTxsToRemove = mergedConfirmedTxs.filter((tx) =>
        onChainHistoryTxs.find(
          (onChainHistoryTx) => onChainHistoryTx.id === tx.id,
        ),
      );
    }
    // If some chains require saving all confirmed transactions, save all confirmed transactions without filtering
    else {
      confirmedTxsToSave = confirmedTxs;
    }

    const nonceHasBeenUsedTxs: IAccountHistoryTx[] = [];
    let finalPendingTxs: IAccountHistoryTx[] = [];
    if (vaultSettings.nonceRequired) {
      pendingTxs.forEach((tx) => {
        if (
          onChainHistoryTxs.find(
            (onChainHistoryTx) =>
              !isNil(onChainHistoryTx.decodedTx.nonce) &&
              !isNil(tx.decodedTx.nonce) &&
              onChainHistoryTx.decodedTx.nonce === tx.decodedTx.nonce,
          )
        ) {
          nonceHasBeenUsedTxs.push(tx);
        } else {
          finalPendingTxs.push(tx);
        }
      });
    } else {
      finalPendingTxs = pendingTxs;
    }

    await this.backgroundApi.simpleDb.localHistory.updateLocalHistoryConfirmedTxs(
      {
        networkId,
        accountAddress,
        xpub,
        confirmedTxsToSave,
        confirmedTxsToRemove,
      },
    );

    await this.backgroundApi.simpleDb.localHistory.updateLocalHistoryPendingTxs(
      {
        networkId,
        accountAddress,
        xpub,
        confirmedTxs: [...confirmedTxs, ...nonceHasBeenUsedTxs],
      },
    );

    // Merge the locally pending transactions, confirmed transactions, and on-chain history to return

    const result = unionBy(
      [
        ...finalPendingTxs,
        ...[...confirmedTxsToSave, ...onChainHistoryTxs].sort(
          (b, a) =>
            (a.decodedTx.updatedAt ?? a.decodedTx.createdAt ?? 0) -
            (b.decodedTx.updatedAt ?? b.decodedTx.createdAt ?? 0),
        ),
      ],
      (tx) => tx.id,
    );

    return result;
  }

  @backgroundMethod()
  async buildFetchHistoryListParams(params: {
    accountId: string;
    networkId: string;
    accountAddress: string;
  }) {
    const { networkId, accountId } = params;
    const vault = await vaultFactory.getVault({ networkId, accountId });
    return vault.buildFetchHistoryListParams(params);
  }

  @backgroundMethod()
  public async fetchAccountOnChainHistory(
    params: IFetchAccountHistoryParams & {
      accountAddress: string;
      xpub?: string;
    },
  ) {
    const { accountId, networkId, xpub, tokenIdOnNetwork, accountAddress } =
      params;
    const extraParams = await this.buildFetchHistoryListParams(params);
    let extraRequestParams = extraParams;
    if (networkId === getNetworkIdsMap().all) {
      extraRequestParams = {
        allNetworkAccounts: (
          extraParams as unknown as {
            allNetworkAccounts: IAllNetworkHistoryExtraItem[];
          }
        ).allNetworkAccounts.map((i) => ({
          networkId: i.networkId,
          accountAddress: i.accountAddress,
        })),
      };
    }
    const vault = await vaultFactory.getVault({
      accountId,
      networkId,
    });
    const client = await this.getClient(EServiceEndpointEnum.Wallet);
    let resp;
    try {
      resp = await client.post<{ data: IFetchAccountHistoryResp }>(
        '/wallet/v1/account/history/list',
        {
          networkId,
          accountAddress,
          xpub,
          tokenAddress: tokenIdOnNetwork,
          ...extraRequestParams,
        },
        {
          headers:
            await this.backgroundApi.serviceAccountProfile._getWalletTypeHeader(
              {
                accountId: params.accountId,
              },
            ),
        },
      );
    } catch (e) {
      const error = e as OneKeyServerApiError;
      // Exchange the token on the first error to ensure subsequent polling requests succeed
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (error.data?.data?.message?.code === 50401) {
        // 50401 -> Lightning service special error code
        await (vault as ILightningVault).exchangeToken();
      }
      throw e;
    }

    const { data: onChainHistoryTxs, tokens, nfts } = resp.data.data;

    const txs = (
      await Promise.all(
        onChainHistoryTxs.map((tx, index) =>
          vault.buildOnChainHistoryTx({
            accountId,
            networkId,
            accountAddress,
            xpub,
            onChainHistoryTx: tx,
            tokens,
            nfts,
            index,
            // @ts-expect-error
            allNetworkHistoryExtraItems: extraParams?.allNetworkAccounts,
          }),
        ),
      )
    ).filter(Boolean);

    return txs;
  }

  @backgroundMethod()
  public async fetchHistoryTxDetails(params: IFetchHistoryTxDetailsParams) {
    try {
      const { accountId, networkId, txid, withUTXOs } = params;

      const [accountAddress, xpub] = await Promise.all([
        this.backgroundApi.serviceAccount.getAccountAddressForApi({
          accountId,
          networkId,
        }),
        this.backgroundApi.serviceAccount.getAccountXpub({
          accountId,
          networkId,
        }),
      ]);

      const extraParams = await this.buildFetchHistoryListParams({
        ...params,
        accountAddress: accountAddress || '',
      });

      const requestParams = withUTXOs
        ? {
            networkId,
            txid,
            ...extraParams,
          }
        : {
            networkId,
            txid,
            xpub,
            accountAddress,
            ...extraParams,
          };

      const client = await this.getClient(EServiceEndpointEnum.Wallet);
      const resp = await client.get<{ data: IFetchHistoryTxDetailsResp }>(
        '/wallet/v1/account/history/detail',
        {
          params: requestParams,
          headers:
            await this.backgroundApi.serviceAccountProfile._getWalletTypeHeader(
              {
                accountId,
              },
            ),
        },
      );
      return resp.data.data;
    } catch (e) {
      console.log(e);
      return null;
    }
  }

  @backgroundMethod()
  public async fetchTxDetails({
    accountId,
    networkId,
    txid,
  }: IFetchTxDetailsParams) {
    return this.fetchHistoryTxDetails({
      accountId,
      networkId,
      txid,
    });
  }

  @backgroundMethod()
  public async getAccountLocalHistoryPendingTxs(params: {
    networkId: string;
    accountAddress: string;
    xpub?: string;
    tokenIdOnNetwork?: string;
    limit?: number;
  }) {
    const { accountAddress, xpub, networkId, tokenIdOnNetwork } = params;
    const localHistoryPendingTxs =
      await this.backgroundApi.simpleDb.localHistory.getAccountLocalHistoryPendingTxs(
        {
          networkId,
          accountAddress,
          xpub,
          tokenIdOnNetwork,
        },
      );

    return localHistoryPendingTxs;
  }

  @backgroundMethod()
  public async getLocalHistoryTxById(params: {
    accountId: string;
    networkId: string;
    historyId: string;
  }) {
    const { accountId, networkId, historyId } = params;
    const [xpub, accountAddress] = await Promise.all([
      this.backgroundApi.serviceAccount.getAccountXpub({
        accountId,
        networkId,
      }),
      this.backgroundApi.serviceAccount.getAccountAddressForApi({
        accountId,
        networkId,
      }),
    ]);

    return this.backgroundApi.simpleDb.localHistory.getLocalHistoryTxById({
      networkId,
      accountAddress,
      xpub,
      historyId,
    });
  }

  @backgroundMethod()
  public async saveLocalHistoryPendingTxs(params: {
    networkId: string;
    accountAddress?: string;
    xpub?: string;
    pendingTxs: IAccountHistoryTx[];
  }) {
    const { networkId, accountAddress, xpub, pendingTxs } = params;

    return this.backgroundApi.simpleDb.localHistory.saveLocalHistoryPendingTxs({
      networkId,
      accountAddress,
      xpub,
      txs: pendingTxs,
    });
  }

  @backgroundMethod()
  public async clearLocalHistoryPendingTxs() {
    return this.backgroundApi.simpleDb.localHistory.clearLocalHistoryPendingTxs();
  }

  @backgroundMethod()
  public async clearLocalHistory() {
    return this.backgroundApi.simpleDb.localHistory.clearLocalHistory();
  }

  @backgroundMethod()
  public async getAccountLocalHistoryConfirmedTxs(params: {
    networkId: string;
    accountAddress: string;
    xpub?: string;
    tokenIdOnNetwork?: string;
    limit?: number;
  }) {
    const { accountAddress, xpub, networkId, tokenIdOnNetwork } = params;
    const localHistoryPendingTxs =
      await this.backgroundApi.simpleDb.localHistory.getAccountLocalHistoryConfirmedTxs(
        {
          networkId,
          accountAddress,
          xpub,
          tokenIdOnNetwork,
        },
      );

    return localHistoryPendingTxs;
  }

  @backgroundMethod()
  public async saveSendConfirmHistoryTxs(params: {
    networkId: string;
    accountId: string;
    data: ISendTxOnSuccessData;
    replaceTxInfo?: IReplaceTxInfo;
  }) {
    const { networkId, accountId, data, replaceTxInfo } = params;

    if (!data || !data.decodedTx) {
      return;
    }

    const { decodedTx, signedTx } = data;
    const vaultSettings =
      await this.backgroundApi.serviceNetwork.getVaultSettings({ networkId });

    const vault = await vaultFactory.getVault({ networkId, accountId });
    const newHistoryTx = await vault.buildHistoryTx({
      decodedTx,
      signedTx,
      isSigner: true,
      isLocalCreated: true,
    });

    const [xpub, accountAddress] = await Promise.all([
      this.backgroundApi.serviceAccount.getAccountXpub({
        accountId,
        networkId,
      }),
      this.backgroundApi.serviceAccount.getAccountAddressForApi({
        accountId,
        networkId,
      }),
    ]);

    if (signedTx.stakingInfo) {
      newHistoryTx.stakingInfo = signedTx.stakingInfo;
    }

    if (vaultSettings.replaceTxEnabled) {
      try {
        newHistoryTx.decodedTx.encodedTxEncrypted =
          newHistoryTx.decodedTx.encodedTxEncrypted ||
          (await this.backgroundApi.servicePassword.encryptByInstanceId(
            JSON.stringify(decodedTx.encodedTx),
          ));
      } catch (error) {
        console.error(error);
      }
    }

    let prevTx: IAccountHistoryTx | undefined;
    if (replaceTxInfo && replaceTxInfo.replaceHistoryId) {
      prevTx = await simpleDb.localHistory.getLocalHistoryTxById({
        historyId: replaceTxInfo.replaceHistoryId,
        networkId,
        accountAddress,
        xpub,
      });
      if (prevTx) {
        prevTx.decodedTx.status = EDecodedTxStatus.Dropped;
        prevTx.replacedNextId = newHistoryTx.id;

        newHistoryTx.replacedPrevId = prevTx.id;
        newHistoryTx.replacedType = replaceTxInfo.replaceType;
        newHistoryTx.decodedTx.interactInfo =
          newHistoryTx.decodedTx.interactInfo || prevTx.decodedTx.interactInfo;

        if (replaceTxInfo.replaceType === EReplaceTxType.Cancel) {
          newHistoryTx.decodedTx.actions =
            prevTx.decodedTx.actions || newHistoryTx.decodedTx.actions;
        }

        // if the prev tx is a cancel tx, the new tx should keep canceled status
        if (prevTx.replacedType === EReplaceTxType.Cancel) {
          newHistoryTx.decodedTx.actions =
            prevTx.decodedTx.actions || newHistoryTx.decodedTx.actions;
          newHistoryTx.replacedType = EReplaceTxType.Cancel;
        }

        void this.backgroundApi.serviceSwap.updateSwapHistoryTx({
          oldTxId: prevTx.decodedTx.txid,
          newTxId: newHistoryTx.decodedTx.txid,
          status:
            replaceTxInfo.replaceType === EReplaceTxType.Cancel
              ? ESwapTxHistoryStatus.CANCELING
              : ESwapTxHistoryStatus.PENDING,
        });
      }
    }

    if (prevTx) {
      await this.backgroundApi.simpleDb.localHistory.updateLocalHistoryPendingTxs(
        {
          networkId,
          accountAddress,
          xpub,
          confirmedTxs: [prevTx],
        },
      );
    }

    await this.saveLocalHistoryPendingTxs({
      networkId,
      accountAddress,
      xpub,
      pendingTxs: [newHistoryTx],
    });
  }

  @backgroundMethod()
  public async getLocalHistoryMinPendingNonce(params: {
    networkId: string;
    accountAddress: string;
    xpub?: string;
  }) {
    return this.backgroundApi.simpleDb.localHistory.getMinPendingNonce(params);
  }

  @backgroundMethod()
  public async isEarliestLocalPendingTx({
    networkId,
    accountId,
    encodedTx,
  }: {
    networkId: string;
    accountId: string;
    encodedTx: IEncodedTx;
  }) {
    const vault = await vaultFactory.getVault({ networkId, accountId });
    return vault.isEarliestLocalPendingTx({ encodedTx });
  }
}

export default ServiceHistory;
