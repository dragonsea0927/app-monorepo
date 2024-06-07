import { Suspense, useCallback, useEffect, useRef } from 'react';

import { isNil } from 'lodash';
import { useIntl } from 'react-intl';

import { Dialog, Spinner } from '@onekeyhq/components';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import { EPasswordPromptType } from '@onekeyhq/kit-bg/src/services/ServicePassword/types';
import { usePasswordPromptPromiseTriggerAtom } from '@onekeyhq/kit-bg/src/states/jotai/atoms/password';
import { ETranslations } from '@onekeyhq/shared/src/locale';

import PasswordSetupContainer from './PasswordSetupContainer';
import PasswordVerifyContainer from './PasswordVerifyContainer';

const PasswordVerifyPromptMount = () => {
  const intl = useIntl();

  const [{ passwordPromptPromiseTriggerData }] =
    usePasswordPromptPromiseTriggerAtom();
  const onClose = useCallback((id: number) => {
    void backgroundApiProxy.servicePassword.rejectPasswordPromptDialog(id, {
      message: 'User Cancelled Password Verify',
    });
  }, []);

  const dialogRef = useRef<ReturnType<typeof Dialog.show> | null>(null);

  const showPasswordSetupPrompt = useCallback(
    (id: number) => {
      dialogRef.current = Dialog.show({
        title: intl.formatMessage({ id: ETranslations.global_set_password }),
        onClose() {
          onClose(id);
        },
        renderContent: (
          <Suspense fallback={<Spinner size="large" />}>
            <PasswordSetupContainer
              onSetupRes={async (data) => {
                await backgroundApiProxy.servicePassword.resolvePasswordPromptDialog(
                  id,
                  {
                    password: data,
                  },
                );
              }}
            />
          </Suspense>
        ),
        showFooter: false,
      });
    },
    [intl, onClose],
  );
  const showPasswordVerifyPrompt = useCallback(
    (id: number) => {
      dialogRef.current = Dialog.show({
        title: intl.formatMessage({
          id: ETranslations.auth_confirm_password_form_label,
        }),
        onClose() {
          onClose(id);
        },
        renderContent: (
          <Suspense fallback={<Spinner size="large" />}>
            <PasswordVerifyContainer
              onVerifyRes={async (data) => {
                await backgroundApiProxy.servicePassword.resolvePasswordPromptDialog(
                  id,
                  {
                    password: data,
                  },
                );
              }}
            />
          </Suspense>
        ),
        showFooter: false,
      });
    },
    [intl, onClose],
  );
  useEffect(() => {
    if (
      passwordPromptPromiseTriggerData &&
      !isNil(passwordPromptPromiseTriggerData.idNumber)
    ) {
      if (
        passwordPromptPromiseTriggerData.type ===
        EPasswordPromptType.PASSWORD_VERIFY
      ) {
        showPasswordVerifyPrompt(passwordPromptPromiseTriggerData.idNumber);
      } else {
        showPasswordSetupPrompt(passwordPromptPromiseTriggerData.idNumber);
      }
    } else {
      void dialogRef.current?.close();
    }
  }, [
    passwordPromptPromiseTriggerData,
    showPasswordSetupPrompt,
    showPasswordVerifyPrompt,
  ]);

  return null;
};

export default PasswordVerifyPromptMount;
