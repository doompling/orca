import { getPackagedEtherProduct } from '../ether-build'
import {
  getDevInstanceIdentity as getUpstreamDevInstanceIdentity,
  type DevInstanceIdentity
} from './dev-instance-identity'

export { shouldApplyPreReadyAppName } from './dev-instance-identity'

/** Upstream's identity, except that a packaged Ether names itself. */
export function getDevInstanceIdentity(
  isDev: boolean,
  env: NodeJS.ProcessEnv = process.env
): DevInstanceIdentity {
  return getUpstreamDevInstanceIdentity(isDev, env, getPackagedEtherProduct())
}
