import { useCallback, useEffect, useState } from 'react';

import { useIsFocused } from '@react-navigation/native';
import { useKeepAwake } from 'expo-keep-awake';
import { Alert, BackHandler } from 'react-native';

import {
  Checkbox,
  Dialog,
  SizableText,
  Stack,
  usePreventRemove,
} from '@onekeyhq/components';
import useAppNavigation from '@onekeyhq/kit/src/hooks/useAppNavigation';
import { FIRMWARE_UPDATE_PREVENT_EXIT } from '@onekeyhq/kit-bg/src/services/ServiceFirmwareUpdate/firmwareUpdateConsts';
import { useV4migrationPersistAtom } from '@onekeyhq/kit-bg/src/states/jotai/atoms';
import platformEnv from '@onekeyhq/shared/src/platformEnv';

import { useV4MigrationActions } from './useV4MigrationActions';

let isNavExitConfirmShow = false;

type INavigationPreventRemoveData = {
  action: Readonly<{
    type: string;
    payload?: object | undefined;
    source?: string | undefined;
    target?: string | undefined;
  }>;
};

export enum EModalExitPreventMode {
  always = 'always',
  confirm = 'confirm',
  disabled = 'disabled',
}

function ModalExitPreventDialogContent({
  message,
  onCancelText,
  onConfirmText,
  preventRemoveData,
  isAutoStartOnMount,
}: {
  message: string;
  onConfirmText: string;
  onCancelText: string;
  preventRemoveData: INavigationPreventRemoveData;
  isAutoStartOnMount?: boolean;
}) {
  const navigation = useAppNavigation();
  const [v4MigrationPersistData, setV4MigrationPersistData] =
    useV4migrationPersistAtom();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  return (
    <Stack>
      <SizableText>{message}</SizableText>
      {isAutoStartOnMount &&
      (v4MigrationPersistData?.v4migrationAutoStartCount || 0) >= 3 ? (
        <Stack>
          <Checkbox
            value={dontShowAgain}
            onChange={() => setDontShowAgain(!dontShowAgain)}
            label="Never show this migration on App start"
          />
        </Stack>
      ) : null}
      <Dialog.Footer
        onConfirmText={onConfirmText}
        onConfirm={() => {
          navigation.dispatch(preventRemoveData.action);
          if (dontShowAgain) {
            setV4MigrationPersistData((v) => ({
              ...v,
              v4migrationAutoStartDisabled: true,
            }));
          }
        }}
        onCancelText={onCancelText}
      />
    </Stack>
  );
}

export function useModalExitPrevent({
  exitPreventMode,
  isAutoStartOnMount,
  title,
  message,
  onConfirmText,
  onCancelText,
}: {
  exitPreventMode: EModalExitPreventMode;
  isAutoStartOnMount?: boolean;
  title: string;
  message: string;
  onConfirmText: string;
  onCancelText: string;
}) {
  const isFocused = useIsFocused();
  const navPreventRemoveCallback = useCallback(
    ({ data }: { data: INavigationPreventRemoveData }) => {
      if (isNavExitConfirmShow) {
        return;
      }
      isNavExitConfirmShow = true;
      Dialog.show({
        title,
        renderContent: (
          <ModalExitPreventDialogContent
            onCancelText={onCancelText}
            onConfirmText={onConfirmText}
            preventRemoveData={data}
            message={message}
            isAutoStartOnMount={isAutoStartOnMount}
          />
        ),
        onClose: () => {
          isNavExitConfirmShow = false;
        },
      });
    },
    [isAutoStartOnMount, message, onCancelText, onConfirmText, title],
  );
  const shouldPreventRemove =
    exitPreventMode !== EModalExitPreventMode.disabled && isFocused;
  usePreventRemove(
    shouldPreventRemove,
    exitPreventMode === EModalExitPreventMode.confirm
      ? navPreventRemoveCallback
      : () => null,
  );
}

export function useAppExitPrevent({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  // Prevents web page refresh/exit
  useEffect(() => {
    if (platformEnv.isRuntimeBrowser && !platformEnv.isExtensionUiPopup) {
      const fn = (event: BeforeUnloadEvent) => {
        event.preventDefault();
        event.returnValue = true;
        return message;
      };
      window.addEventListener('beforeunload', fn);
      return () => {
        window.removeEventListener('beforeunload', fn);
      };
    }
  }, [message]);

  // Prevent Android exit
  // https://reactnavigation.org/docs/7.x/preventing-going-back
  useEffect(() => {
    const onBackPress = () => {
      Alert.alert(
        title,
        message,
        [
          {
            text: FIRMWARE_UPDATE_PREVENT_EXIT.cancel,
            onPress: () => {
              // Do nothing
            },
            style: 'cancel',
          },
          {
            text: FIRMWARE_UPDATE_PREVENT_EXIT.confirm,
            onPress: () => BackHandler.exitApp(),
          },
        ],
        { cancelable: false },
      );

      return true;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      onBackPress,
    );

    return () => backHandler.remove();
  }, [message, title]);

  // Prevent Desktop exit
  // TODO
}

export function useExtensionV4MigrationFromExpandTab() {
  const actions = useV4MigrationActions();

  useEffect(() => {
    if (platformEnv.isExtensionUiPopup) {
      void actions.openV4MigrationOfExtension();
      window.close();
    }
  }, [actions]);
}

export function useV4MigrationExitPrevent({
  exitPreventMode,
  isAutoStartOnMount,
}: {
  exitPreventMode: EModalExitPreventMode;
  isAutoStartOnMount?: boolean;
}) {
  const title = 'Confirm Exit';
  const message = 'Confirm Exit Migration from V4?';
  const onConfirmText = 'Exit';
  const onCancelText = 'Cancel';

  // Prevents screen locking
  useKeepAwake();

  // Prevent Modal exit/back
  useModalExitPrevent({
    exitPreventMode,
    isAutoStartOnMount,
    title,
    message,
    onConfirmText,
    onCancelText,
  });

  // Prevent App exit
  useAppExitPrevent({
    title,
    message,
  });

  // Prevent Extension V4 Migration from Popup
  useExtensionV4MigrationFromExpandTab();

  // Prevent lockApp:
  //   check servicePassword.lockApp()
}
