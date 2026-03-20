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
  | 'openDirectDialog'
  | 'registerAccount'
  | 'requestCode'
  | 'saveSnapshot'
  | 'searchAccounts'
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
