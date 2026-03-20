import type { TinychokStore } from './store'

export type AppStore = Pick<
  TinychokStore,
  | 'createGroup'
  | 'createManagedChannel'
  | 'deleteDialog'
  | 'deleteDialogHistory'
  | 'deleteDialogMessage'
  | 'deleteManagedChannel'
  | 'getIdentifierByToken'
  | 'getSnapshotByToken'
  | 'listTokensByIdentifier'
  | 'markDialogRead'
  | 'markGroupRead'
  | 'markSubscriptionChannelRead'
  | 'registerAccount'
  | 'requestCode'
  | 'saveSnapshot'
  | 'sendDirectMessage'
  | 'sendGroupMessage'
  | 'setDialogFavorite'
  | 'setDialogPinnedMessage'
  | 'updateManagedChannel'
  | 'updateSession'
  | 'verifyCode'
>

export type StoreMetadata = {
  bootstrapSource?: 'empty' | 'file' | 'postgres'
  mode: 'file' | 'postgres'
  stateTableName?: string
}
