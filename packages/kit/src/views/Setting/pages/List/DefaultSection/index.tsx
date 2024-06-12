import { useCallback, useEffect } from 'react';

import { useIntl } from 'react-intl';

import { Dialog, YStack } from '@onekeyhq/components';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import { ListItem } from '@onekeyhq/kit/src/components/ListItem';
import useAppNavigation from '@onekeyhq/kit/src/hooks/useAppNavigation';
import { usePromiseResult } from '@onekeyhq/kit/src/hooks/usePromiseResult';
import {
  useAddressBookPersistAtom,
  usePasswordPersistAtom,
} from '@onekeyhq/kit-bg/src/states/jotai/atoms';
import { backupPlatform } from '@onekeyhq/shared/src/cloudfs';
import {
  EAppEventBusNames,
  appEventBus,
} from '@onekeyhq/shared/src/eventBus/appEventBus';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import {
  ECloudBackupRoutes,
  EDAppConnectionModal,
  ELiteCardRoutes,
  EModalAddressBookRoutes,
  EModalKeyTagRoutes,
  EModalRoutes,
} from '@onekeyhq/shared/src/routes';

const AddressBookItem = () => {
  const intl = useIntl();
  const navigation = useAppNavigation();
  const showAddressBook = useCallback(async () => {
    await backgroundApiProxy.servicePassword.promptPasswordVerify();
    navigation.push(EModalAddressBookRoutes.ListItemModal);
  }, [navigation]);
  const [{ hideDialogInfo }] = useAddressBookPersistAtom();
  const onPress = useCallback(async () => {
    if (!hideDialogInfo) {
      Dialog.show({
        title: intl.formatMessage({
          id: ETranslations.address_book_encrypted_storage_title,
        }),
        icon: 'PlaceholderOutline',
        description: intl.formatMessage({
          id: ETranslations.address_book_encrypted_storage_description,
        }),
        tone: 'default',
        showConfirmButton: true,
        showCancelButton: true,
        onConfirm: async (inst) => {
          await inst.close();
          await showAddressBook();
          await backgroundApiProxy.serviceAddressBook.hideDialogInfo();
        },
        confirmButtonProps: {
          testID: 'encrypted-storage-confirm',
        },
      });
    } else {
      await showAddressBook();
    }
  }, [showAddressBook, hideDialogInfo, intl]);
  return (
    <ListItem
      icon="BookOpenOutline"
      title={intl.formatMessage({ id: ETranslations.settings_address_book })}
      drillIn
      onPress={onPress}
      testID="setting-address-book"
    />
  );
};

const LockNowButton = () => {
  const intl = useIntl();
  const navigation = useAppNavigation();
  const [passwordSetting] = usePasswordPersistAtom();
  const onLock = useCallback(async () => {
    if (passwordSetting.isPasswordSet) {
      await backgroundApiProxy.servicePassword.lockApp();
    } else {
      await backgroundApiProxy.servicePassword.promptPasswordVerify();
      await backgroundApiProxy.servicePassword.lockApp();
    }
    navigation.popStack();
  }, [passwordSetting.isPasswordSet, navigation]);
  return (
    <ListItem
      icon="LockOutline"
      title={intl.formatMessage({ id: ETranslations.settings_lock_now })}
      onPress={onLock}
    />
  );
};

const DefaultWalletSetting = () => {
  const intl = useIntl();
  const navigation = useAppNavigation();
  const { result, isLoading, run } = usePromiseResult(
    async () =>
      backgroundApiProxy.serviceContextMenu.getDefaultWalletSettingsWithIcon(),
    [],
    { checkIsFocused: false },
  );
  useEffect(() => {
    appEventBus.addListener(EAppEventBusNames.ExtensionContextMenuUpdate, run);
    return () => {
      appEventBus.removeListener(
        EAppEventBusNames.ExtensionContextMenuUpdate,
        run,
      );
    };
  }, [run]);
  return (
    <ListItem
      icon="ThumbtackOutline"
      title={intl.formatMessage({
        id: ETranslations.settings_default_wallet_settings,
      })}
      drillIn
      onPress={() => {
        navigation.pushModal(EModalRoutes.DAppConnectionModal, {
          screen: EDAppConnectionModal.DefaultWalletSettingsModal,
        });
      }}
    >
      {isLoading ? null : (
        <ListItem.Text
          primary={
            result?.isDefaultWallet
              ? intl.formatMessage({ id: ETranslations.global_on })
              : intl.formatMessage({ id: ETranslations.global_off })
          }
          align="right"
        />
      )}
    </ListItem>
  );
};

export const DefaultSection = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const intl = useIntl();
  const navigation = useAppNavigation();
  return (
    <YStack>
      <LockNowButton />
      {platformEnv.isExtension ? <DefaultWalletSetting /> : null}
      <AddressBookItem />
      {platformEnv.isNative ? (
        <ListItem
          icon="RepeatOutline"
          title={`${backupPlatform().cloudName} Backup`}
          drillIn
          onPress={async () => {
            navigation.pushModal(EModalRoutes.CloudBackupModal, {
              screen: ECloudBackupRoutes.CloudBackupHome,
            });
          }}
        />
      ) : null}
      {/* <ListItem
        icon="RepeatOutline"
        title="Migration"
        drillIn
        onPress={() => {}}
      /> */}
      {platformEnv.isNative ? (
        <ListItem
          icon="OnekeyLiteOutline"
          title={intl.formatMessage({ id: ETranslations.global_onekey_lite })}
          drillIn
          onPress={() => {
            navigation.pushModal(EModalRoutes.LiteCardModal, {
              screen: ELiteCardRoutes.LiteCardHome,
            });
          }}
        />
      ) : null}
      <ListItem
        icon="OnekeyKeytagOutline"
        title={intl.formatMessage({ id: ETranslations.global_onekey_keytag })}
        drillIn
        onPress={() => {
          navigation.pushModal(EModalRoutes.KeyTagModal, {
            screen: EModalKeyTagRoutes.UserOptions,
          });
        }}
      />
    </YStack>
  );
};
