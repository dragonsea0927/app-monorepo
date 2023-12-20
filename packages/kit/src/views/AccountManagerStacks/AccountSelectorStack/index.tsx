import { useCallback, useState } from 'react';

import { Page } from '@onekeyhq/components';
import { EAccountSelectorSceneName } from '@onekeyhq/shared/types';

import { AccountSelectorProviderMirror } from '../../../components/AccountSelector';
import { type IAccountProps } from '../types';

import { WalletDetails } from './WalletDetails';
import { WalletList } from './WalletList';

export function AccountSelectorStack({ num }: { num: number }) {
  const [isEditMode, setIsEditMode] = useState(false);

  const handleAccountPress = useCallback((accountId: IAccountProps['id']) => {
    console.log('handleAccountPress', accountId);
  }, []);

  return (
    <Page>
      <Page.Header headerShown={false} />
      <Page.Body flexDirection="row">
        <WalletList num={num} />
        <WalletDetails
          num={num}
          onAccountPress={handleAccountPress}
          onEditButtonPress={() => setIsEditMode(!isEditMode)}
          editMode={isEditMode}
        />
      </Page.Body>
    </Page>
  );
}

export function AccountSelectorStackPage() {
  return (
    <AccountSelectorProviderMirror
      config={{
        sceneName: EAccountSelectorSceneName.home, // TODO read from router
      }}
    >
      <AccountSelectorStack num={0} />
    </AccountSelectorProviderMirror>
  );
}
