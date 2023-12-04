import type { IModalRootNavigatorConfig } from '@onekeyhq/components/src/layouts/Navigation/Navigator';
import { ModalSettingStack } from '@onekeyhq/kit/src/views/Setting/Stack';
import platformEnv from '@onekeyhq/shared/src/platformEnv';

import { TestModalRouter } from '../../views/TestModal/router';

import { ModalDiscoverStack } from './Discover';
import { EModalRoutes } from './type';

const router: IModalRootNavigatorConfig<EModalRoutes>[] = [
  {
    name: EModalRoutes.DiscoverModal,
    children: ModalDiscoverStack,
  },
  {
    name: EModalRoutes.SettingModal,
    children: ModalSettingStack,
  },
];

// Pages in Dev Mode
if (platformEnv.isDev) {
  router.push({
    name: EModalRoutes.TestModal,
    children: TestModalRouter,
  });
}

export const modalRouter = router;