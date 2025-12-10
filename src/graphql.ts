import { GraphQLClient, RequestOptions } from 'graphql-request';
import gql from 'graphql-tag';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
type GraphQLClientRequestHeaders = RequestOptions['requestHeaders'];
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Int64: { input: number; output: number; }
  Time: { input: string; output: string; }
  Upload: { input: File; output: File; }
};

export type ActiveOffers = {
  nodes: Array<Offer>;
};

export type Admin = {
  grantedAt: Scalars['Time']['output'];
  grantedBy?: Maybe<AdminUser>;
  id: Scalars['Int64']['output'];
  user: AdminUser;
};

export type AdminAdminsConnection = {
  nodes: Array<Admin>;
};

export type AdminApiKey = {
  createdAt: Scalars['Time']['output'];
  createdBy: AdminUser;
  description: Scalars['String']['output'];
  disabledAt?: Maybe<Scalars['Time']['output']>;
  disabledBy?: Maybe<AdminUser>;
  id: Scalars['Int64']['output'];
};

export type AdminApiKeyLog = {
  actionName: Scalars['String']['output'];
  createdAt: Scalars['Time']['output'];
  ip: Scalars['String']['output'];
};

export type AdminApiKeyLogsConnection = {
  nodes: Array<AdminApiKeyLog>;
};

export type AdminApiKeysConnection = {
  nodes: Array<AdminApiKey>;
};

export type AdminAuditLog = {
  createdAt: Scalars['Time']['output'];
  id: Scalars['Int64']['output'];
  level: AuditLogLevelEnum;
  message: Scalars['String']['output'];
  params: Scalars['String']['output'];
};

export type AdminAuditLogsConnection = {
  nodes: Array<AdminAuditLog>;
};

export type AdminAuditLogsDateFilter = {
  gte?: InputMaybe<Scalars['Time']['input']>;
  lte?: InputMaybe<Scalars['Time']['input']>;
};

export type AdminAuditLogsFilterInput = {
  createdAt?: InputMaybe<AdminAuditLogsDateFilter>;
  limit?: InputMaybe<Scalars['Int64']['input']>;
  offset?: InputMaybe<Scalars['Int64']['input']>;
};

export type AdminBackgroundJob = {
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  params: Scalars['String']['output'];
  priority: Scalars['Int64']['output'];
  retryCount: Scalars['Int64']['output'];
};

export type AdminBackgroundQueue = {
  id: Scalars['String']['output'];
  jobs: Array<AdminBackgroundJob>;
  pendingCount: Scalars['Int64']['output'];
  retryCount: Scalars['Int64']['output'];
  stopped: Scalars['Boolean']['output'];
};

export type AdminBackgroundQueuesConnection = {
  nodes: Array<AdminBackgroundQueue>;
};

export type AdminBoostyCredentials = {
  blogName: Scalars['String']['output'];
  createdAt: Scalars['Time']['output'];
  createdBy: AdminUser;
  deletedAt?: Maybe<Scalars['Time']['output']>;
  deletedBy?: Maybe<AdminUser>;
  deviceId: Scalars['String']['output'];
  id: Scalars['Int64']['output'];
  members: AdminBoostyMembersConnection;
  state: BoostyCredentialsStateEnum;
  tiers: AdminBoostyTiersConnection;
};

export type AdminBoostyCredentialsConnection = {
  nodes: Array<AdminBoostyCredentials>;
};

export type AdminBoostyCredentialsFilterInput = {
  state?: InputMaybe<BoostyCredentialsStateEnum>;
};

export type AdminBoostyMember = {
  boostyId: Scalars['Int64']['output'];
  createdAt: Scalars['Time']['output'];
  currentTier?: Maybe<AdminBoostyTier>;
  data: Scalars['String']['output'];
  email: Scalars['String']['output'];
  id: Scalars['Int64']['output'];
  missedAt?: Maybe<Scalars['Time']['output']>;
  status: Scalars['String']['output'];
};

export type AdminBoostyMembersConnection = {
  nodes: Array<AdminBoostyMember>;
};

export type AdminBoostyTier = {
  boostyId: Scalars['Int64']['output'];
  createdAt: Scalars['Time']['output'];
  data: Scalars['String']['output'];
  id: Scalars['Int64']['output'];
  missedAt?: Maybe<Scalars['Time']['output']>;
  name: Scalars['String']['output'];
  subgraphs: Array<AdminSubgraph>;
};

export type AdminBoostyTiersConnection = {
  nodes: Array<AdminBoostyTier>;
};

export type AdminCancelTelegramAccountAuthInput = {
  phone: Scalars['String']['input'];
};

export type AdminCancelTelegramAccountAuthOrErrorPayload = AdminCancelTelegramAccountAuthPayload | ErrorPayload;

export type AdminCancelTelegramAccountAuthPayload = {
  success: Scalars['Boolean']['output'];
};

export type AdminCompleteTelegramAccountAuthInput = {
  code: Scalars['String']['input'];
  password?: InputMaybe<Scalars['String']['input']>;
  phone: Scalars['String']['input'];
};

export type AdminCompleteTelegramAccountAuthOrErrorPayload = AdminCompleteTelegramAccountAuthPayload | ErrorPayload;

export type AdminCompleteTelegramAccountAuthPayload = {
  account: AdminTelegramAccount;
};

export type AdminConfigVersion = {
  createdAt: Scalars['Time']['output'];
  createdBy: AdminUser;
  defaultLayout: Scalars['String']['output'];
  id: Scalars['Int64']['output'];
  robotsTxt: Scalars['String']['output'];
  showDraftVersions: Scalars['Boolean']['output'];
  timezone: Scalars['String']['output'];
};

export type AdminConfigVersionsConnection = {
  nodes: Array<AdminConfigVersion>;
};

export type AdminCronJob = {
  enabled: Scalars['Boolean']['output'];
  executions: Array<AdminCronJobExecution>;
  expression: Scalars['String']['output'];
  id: Scalars['Int64']['output'];
  lastExecAt?: Maybe<Scalars['Time']['output']>;
  name: Scalars['String']['output'];
};

export type AdminCronJobExecution = {
  errorMessage?: Maybe<Scalars['String']['output']>;
  finishedAt?: Maybe<Scalars['Time']['output']>;
  id: Scalars['Int64']['output'];
  job: AdminCronJob;
  jobId: Scalars['Int64']['output'];
  reportData?: Maybe<Scalars['String']['output']>;
  startedAt: Scalars['Time']['output'];
  status: CronJobExecutionStatus;
};

export type AdminCronJobsConnection = {
  nodes: Array<AdminCronJob>;
};

export type AdminGitToken = {
  canPull: Scalars['Boolean']['output'];
  canPush: Scalars['Boolean']['output'];
  createdAt: Scalars['Time']['output'];
  createdBy: AdminUser;
  description: Scalars['String']['output'];
  disabledAt?: Maybe<Scalars['Time']['output']>;
  disabledBy?: Maybe<AdminUser>;
  id: Scalars['Int64']['output'];
};

export type AdminGitTokensConnection = {
  nodes: Array<AdminGitToken>;
};

export type AdminHtmlInjection = {
  activeFrom?: Maybe<Scalars['Time']['output']>;
  activeTo?: Maybe<Scalars['Time']['output']>;
  content: Scalars['String']['output'];
  createdAt: Scalars['Time']['output'];
  description: Scalars['String']['output'];
  id: Scalars['Int64']['output'];
  placement: Scalars['String']['output'];
  position: Scalars['Int']['output'];
};

export type AdminHtmlInjectionsConnection = {
  nodes: Array<AdminHtmlInjection>;
};

export type AdminImportTelegramAccountChannelInput = {
  accountId: Scalars['Int64']['input'];
  basePath: Scalars['String']['input'];
  channelId: Scalars['Int64']['input'];
  skipExists?: InputMaybe<Scalars['Boolean']['input']>;
  withMedia?: InputMaybe<Scalars['Boolean']['input']>;
};

export type AdminImportTelegramAccountChannelOrErrorPayload = AdminImportTelegramAccountChannelPayload | ErrorPayload;

export type AdminImportTelegramAccountChannelPayload = {
  success: Scalars['Boolean']['output'];
};

export type AdminLatestNoteAssetsConnection = {
  nodes: Array<AdminNoteAsset>;
};

export type AdminLatestNoteViewsConnection = {
  nodes: Array<NoteView>;
};

export type AdminLatestNoteViewsFilter = {
  withWarnings?: InputMaybe<Scalars['Boolean']['input']>;
};

export type AdminMutation = {
  banUser: BanUserOrErrorPayload;
  cancelTelegramAccountAuth: AdminCancelTelegramAccountAuthOrErrorPayload;
  clearBackgroundQueue: ClearBackgroundQueueOrErrorPayload;
  completeTelegramAccountAuth: AdminCompleteTelegramAccountAuthOrErrorPayload;
  createApiKey: CreateApiKeyOrErrorPayload;
  createBoostyCredentials: CreateBoostyCredentialsOrErrorPayload;
  createConfigVersion: CreateConfigVersionOrErrorPayload;
  createGitToken: CreateGitTokenOrErrorPayload;
  createHtmlInjection: CreateHtmlInjectionOrErrorPayload;
  createNotFoundIgnoredPattern: CreateNotFoundIgnoredPatternOrErrorPayload;
  createOffer: CreateOfferOrErrorPayload;
  createPatreonCredentials: CreatePatreonCredentialsOrErrorPayload;
  createRedirect: CreateRedirectOrErrorPayload;
  createRelease: CreateReleaseOrErrorPayload;
  createTgBot: CreateTgBotOrErrorPayload;
  createUser: CreateUserOrErrorPayload;
  deleteBoostyCredentials: DeleteBoostyCredentialsOrErrorPayload;
  deleteHtmlInjection: DeleteHtmlInjectionOrErrorPayload;
  deleteNotFoundIgnoredPattern: DeleteNotFoundIgnoredPatternOrErrorPayload;
  deletePatreonCredentials: DeletePatreonCredentialsOrErrorPayload;
  deleteRedirect: DeleteRedirectOrErrorPayload;
  disableApiKey: DisableApiKeyOrErrorPayload;
  disableGitToken: DisableGitTokenOrErrorPayload;
  importTelegramAccountChannel: AdminImportTelegramAccountChannelOrErrorPayload;
  makeReleaseLive: MakeReleaseLiveOrErrorPayload;
  refreshBoostyData: RefreshBoostyDataOrErrorPayload;
  refreshPatreonData: RefreshPatreonDataOrErrorPayload;
  removeExpiredTgChatMembers: RemoveExpiredTgChatMembersOrErrorPayload;
  resetNotFoundPath: ResetNotFoundPathOrErrorPayload;
  resetTelegramPublishNote: ResetTelegramPublishNoteOrErrorPayload;
  restoreBoostyCredentials: RestoreBoostyCredentialsOrErrorPayload;
  restorePatreonCredentials: RestorePatreonCredentialsOrErrorPayload;
  runCronJob: RunCronJobOrErrorPayload;
  sendTelegramPublishNoteNow: SendTelegramPublishNoteNowOrErrorPayload;
  setBoostyTierSubgraphs: SetBoostyTierSubgraphsOrErrorPayload;
  setPatreonTierSubgraphs: SetPatreonTierSubgraphsOrErrorPayload;
  setTelegramAccountChatPublishInstantTags: AdminSetTelegramAccountChatPublishInstantTagsOrErrorPayload;
  setTelegramAccountChatPublishTags: AdminSetTelegramAccountChatPublishTagsOrErrorPayload;
  setTgChatPublishInstantTags: SetTgChatPublishInstantTagsOrErrorPayload;
  setTgChatPublishTags: SetTgChatPublishTagsOrErrorPayload;
  setTgChatSubgraphInvites: SetTgChatSubgraphInvitesOrErrorPayload;
  setTgChatSubgraphs: SetTgChatSubgraphsOrErrorPayload;
  signOutTelegramAccount: AdminSignOutTelegramAccountOrErrorPayload;
  startBackgroundQueue: StartBackgroundQueueOrErrorPayload;
  startTelegramAccountAuth: AdminStartTelegramAccountAuthOrErrorPayload;
  stopBackgroundQueue: StopBackgroundQueueOrErrorPayload;
  unbanUser: UnbanUserOrErrorPayload;
  updateBoostyCredentials: UpdateBoostyCredentialsOrErrorPayload;
  updateCronJob: UpdateCronJobOrErrorPayload;
  updateHtmlInjection: UpdateHtmlInjectionOrErrorPayload;
  updateNotFoundIgnoredPattern: UpdateNotFoundIgnoredPatternOrErrorPayload;
  updateNoteGraphPositions: UpdateNoteGraphPositionsOrErrorPayload;
  updateOffer: UpdateOfferOrErrorPayload;
  updateRedirect: UpdateRedirectOrErrorPayload;
  updateSubgraph: UpdateSubgraphOrErrorPayload;
  updateTelegramAccount: AdminUpdateTelegramAccountOrErrorPayload;
  updateTgBot: UpdateTgBotOrErrorPayload;
  updateUser: UpdateUserOrErrorPayload;
  updateUserSubgraphAccess: UpdateUserSubgraphAccessOrErrorPayload;
};


export type AdminMutationBanUserArgs = {
  input: BanUserInput;
};


export type AdminMutationCancelTelegramAccountAuthArgs = {
  input: AdminCancelTelegramAccountAuthInput;
};


export type AdminMutationClearBackgroundQueueArgs = {
  input: ClearBackgroundQueueInput;
};


export type AdminMutationCompleteTelegramAccountAuthArgs = {
  input: AdminCompleteTelegramAccountAuthInput;
};


export type AdminMutationCreateApiKeyArgs = {
  input: CreateApiKeyInput;
};


export type AdminMutationCreateBoostyCredentialsArgs = {
  input: CreateBoostyCredentialsInput;
};


export type AdminMutationCreateConfigVersionArgs = {
  input: CreateConfigVersionInput;
};


export type AdminMutationCreateGitTokenArgs = {
  input: CreateGitTokenInput;
};


export type AdminMutationCreateHtmlInjectionArgs = {
  input: CreateHtmlInjectionInput;
};


export type AdminMutationCreateNotFoundIgnoredPatternArgs = {
  input: CreateNotFoundIgnoredPatternInput;
};


export type AdminMutationCreateOfferArgs = {
  input: CreateOfferInput;
};


export type AdminMutationCreatePatreonCredentialsArgs = {
  input: CreatePatreonCredentialsInput;
};


export type AdminMutationCreateRedirectArgs = {
  input: CreateRedirectInput;
};


export type AdminMutationCreateReleaseArgs = {
  input: CreateReleaseInput;
};


export type AdminMutationCreateTgBotArgs = {
  input: CreateTgBotInput;
};


export type AdminMutationCreateUserArgs = {
  input: CreateUserInput;
};


export type AdminMutationDeleteBoostyCredentialsArgs = {
  input: DeleteBoostyCredentialsInput;
};


export type AdminMutationDeleteHtmlInjectionArgs = {
  input: DeleteHtmlInjectionInput;
};


export type AdminMutationDeleteNotFoundIgnoredPatternArgs = {
  input: DeleteNotFoundIgnoredPatternInput;
};


export type AdminMutationDeletePatreonCredentialsArgs = {
  input: DeletePatreonCredentialsInput;
};


export type AdminMutationDeleteRedirectArgs = {
  input: DeleteRedirectInput;
};


export type AdminMutationDisableApiKeyArgs = {
  input: DisableApiKeyInput;
};


export type AdminMutationDisableGitTokenArgs = {
  input: DisableGitTokenInput;
};


export type AdminMutationImportTelegramAccountChannelArgs = {
  input: AdminImportTelegramAccountChannelInput;
};


export type AdminMutationMakeReleaseLiveArgs = {
  input: MakeReleaseLiveInput;
};


export type AdminMutationRefreshBoostyDataArgs = {
  input: RefreshBoostyDataInput;
};


export type AdminMutationRefreshPatreonDataArgs = {
  input: RefreshPatreonDataInput;
};


export type AdminMutationRemoveExpiredTgChatMembersArgs = {
  input: RemoveExpiredTgChatMembersInput;
};


export type AdminMutationResetNotFoundPathArgs = {
  input: ResetNotFoundPathInput;
};


export type AdminMutationResetTelegramPublishNoteArgs = {
  input: ResetTelegramPublishNoteInput;
};


export type AdminMutationRestoreBoostyCredentialsArgs = {
  input: RestoreBoostyCredentialsInput;
};


export type AdminMutationRestorePatreonCredentialsArgs = {
  input: RestorePatreonCredentialsInput;
};


export type AdminMutationRunCronJobArgs = {
  input: RunCronJobInput;
};


export type AdminMutationSendTelegramPublishNoteNowArgs = {
  input: SendTelegramPublishNoteNowInput;
};


export type AdminMutationSetBoostyTierSubgraphsArgs = {
  input: SetBoostyTierSubgraphsInput;
};


export type AdminMutationSetPatreonTierSubgraphsArgs = {
  input: SetPatreonTierSubgraphsInput;
};


export type AdminMutationSetTelegramAccountChatPublishInstantTagsArgs = {
  input: AdminSetTelegramAccountChatPublishInstantTagsInput;
};


export type AdminMutationSetTelegramAccountChatPublishTagsArgs = {
  input: AdminSetTelegramAccountChatPublishTagsInput;
};


export type AdminMutationSetTgChatPublishInstantTagsArgs = {
  input: SetTgChatPublishInstantTagsInput;
};


export type AdminMutationSetTgChatPublishTagsArgs = {
  input: SetTgChatPublishTagsInput;
};


export type AdminMutationSetTgChatSubgraphInvitesArgs = {
  input: SetTgChatSubgraphInvitesInput;
};


export type AdminMutationSetTgChatSubgraphsArgs = {
  input: SetTgChatSubgraphsInput;
};


export type AdminMutationSignOutTelegramAccountArgs = {
  input: AdminSignOutTelegramAccountInput;
};


export type AdminMutationStartBackgroundQueueArgs = {
  input: StartBackgroundQueueInput;
};


export type AdminMutationStartTelegramAccountAuthArgs = {
  input: AdminStartTelegramAccountAuthInput;
};


export type AdminMutationStopBackgroundQueueArgs = {
  input: StopBackgroundQueueInput;
};


export type AdminMutationUnbanUserArgs = {
  input: UnbanUserInput;
};


export type AdminMutationUpdateBoostyCredentialsArgs = {
  input: UpdateBoostyCredentialsInput;
};


export type AdminMutationUpdateCronJobArgs = {
  input: UpdateCronJobInput;
};


export type AdminMutationUpdateHtmlInjectionArgs = {
  input: UpdateHtmlInjectionInput;
};


export type AdminMutationUpdateNotFoundIgnoredPatternArgs = {
  input: UpdateNotFoundIgnoredPatternInput;
};


export type AdminMutationUpdateNoteGraphPositionsArgs = {
  input: UpdateNoteGraphPositionsInput;
};


export type AdminMutationUpdateOfferArgs = {
  input: UpdateOfferInput;
};


export type AdminMutationUpdateRedirectArgs = {
  input: UpdateRedirectInput;
};


export type AdminMutationUpdateSubgraphArgs = {
  input: UpdateSubgraphInput;
};


export type AdminMutationUpdateTelegramAccountArgs = {
  input: AdminUpdateTelegramAccountInput;
};


export type AdminMutationUpdateTgBotArgs = {
  input: UpdateTgBotInput;
};


export type AdminMutationUpdateUserArgs = {
  input: UpdateUserInput;
};


export type AdminMutationUpdateUserSubgraphAccessArgs = {
  input: UpdateUserSubgraphAccessInput;
};

export type AdminNotFoundIgnoredPattern = {
  createdAt: Scalars['Time']['output'];
  createdBy: AdminUser;
  id: Scalars['Int64']['output'];
  pattern: Scalars['String']['output'];
};

export type AdminNotFoundIgnoredPatternsConnection = {
  nodes: Array<AdminNotFoundIgnoredPattern>;
};

export type AdminNotFoundPath = {
  id: Scalars['Int64']['output'];
  lastHitAt: Scalars['Time']['output'];
  path: Scalars['String']['output'];
  totalHits: Scalars['Int64']['output'];
};

export type AdminNotFoundPathsConnection = {
  nodes: Array<AdminNotFoundPath>;
};

export type AdminNoteAsset = {
  absolutePath: Scalars['String']['output'];
  createdAt: Scalars['Time']['output'];
  fileName: Scalars['String']['output'];
  id: Scalars['Int64']['output'];
  size: Scalars['Int64']['output'];
  url: Scalars['String']['output'];
};

export type AdminOffer = {
  createdAt: Scalars['Time']['output'];
  endsAt?: Maybe<Scalars['Time']['output']>;
  id: Scalars['Int64']['output'];
  lifetime?: Maybe<Scalars['String']['output']>;
  priceUSD: Scalars['Float']['output'];
  publicId: Scalars['String']['output'];
  startsAt?: Maybe<Scalars['Time']['output']>;
  subgraphIds: Array<Scalars['Int64']['output']>;
  subgraphs: Array<AdminSubgraph>;
};

export type AdminOffersConnection = {
  nodes: Array<AdminOffer>;
};

export type AdminPatreonCampaign = {
  attributes: Scalars['String']['output'];
  campaignID: Scalars['String']['output'];
  createdAt: Scalars['Time']['output'];
  credentialsID: Scalars['Int64']['output'];
  id: Scalars['Int64']['output'];
  missedAt?: Maybe<Scalars['Time']['output']>;
};

export type AdminPatreonCredentials = {
  createdAt: Scalars['Time']['output'];
  createdBy: AdminUser;
  creatorAccessToken: Scalars['String']['output'];
  deletedAt?: Maybe<Scalars['Time']['output']>;
  deletedBy?: Maybe<AdminUser>;
  id: Scalars['Int64']['output'];
  members: AdminPatreonMembersConnection;
  state: PatreonCredentialsStateEnum;
  syncedAt?: Maybe<Scalars['Time']['output']>;
  tiers: AdminPatreonTiersConnection;
};

export type AdminPatreonCredentialsConnection = {
  nodes: Array<AdminPatreonCredentials>;
};

export type AdminPatreonCredentialsFilterInput = {
  state?: InputMaybe<PatreonCredentialsStateEnum>;
};

export type AdminPatreonMember = {
  campaignID: Scalars['Int64']['output'];
  currentTier?: Maybe<AdminPatreonTier>;
  currentTierID?: Maybe<Scalars['Int64']['output']>;
  email: Scalars['String']['output'];
  id: Scalars['Int64']['output'];
  patreonID: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export type AdminPatreonMembersConnection = {
  nodes: Array<AdminPatreonMember>;
};

export type AdminPatreonTier = {
  amountCents: Scalars['Int64']['output'];
  attributes: Scalars['String']['output'];
  campaignID: Scalars['Int64']['output'];
  createdAt: Scalars['Time']['output'];
  id: Scalars['Int64']['output'];
  missedAt?: Maybe<Scalars['Time']['output']>;
  subgraphs: Array<AdminSubgraph>;
  tierID: Scalars['String']['output'];
  title: Scalars['String']['output'];
};

export type AdminPatreonTiersConnection = {
  nodes: Array<AdminPatreonTier>;
};

export type AdminPurchase = {
  createdAt: Scalars['Time']['output'];
  email: Scalars['String']['output'];
  id: Scalars['String']['output'];
  offer: AdminOffer;
  offerId: Scalars['Int64']['output'];
  paymentProvider: Scalars['String']['output'];
  status: Scalars['String']['output'];
  successful: Scalars['Boolean']['output'];
  user?: Maybe<AdminUser>;
  userId?: Maybe<Scalars['Int64']['output']>;
};

export type AdminPurchasesConnection = {
  nodes: Array<AdminPurchase>;
};

export type AdminQuery = {
  activeUserSubgraphs: Array<Scalars['String']['output']>;
  allAdmins: AdminAdminsConnection;
  allApiKeys: AdminApiKeysConnection;
  allBackgroundQueues: AdminBackgroundQueuesConnection;
  allBoostyCredentials: AdminBoostyCredentialsConnection;
  allConfigVersions: AdminConfigVersionsConnection;
  allCronJobs: AdminCronJobsConnection;
  allGitTokens: AdminGitTokensConnection;
  allHtmlInjections: AdminHtmlInjectionsConnection;
  allLatestNoteAssets: AdminLatestNoteAssetsConnection;
  allLatestNoteViews: AdminLatestNoteViewsConnection;
  allNotFoundIgnoredPatterns: AdminNotFoundIgnoredPatternsConnection;
  allNotFoundPaths: AdminNotFoundPathsConnection;
  allOffers: AdminOffersConnection;
  allPatreonCredentials: AdminPatreonCredentialsConnection;
  allPurchases: AdminPurchasesConnection;
  allRedirects: AdminRedirectsConnection;
  allReleases: AdminReleasesConnection;
  allSubgraphs: AdminSubgraphsConnection;
  allTelegramAccounts: AdminTelegramAccountsConnection;
  allTelegramPublishNotes: AdminTelegramPublishNotesConnection;
  allTelegramPublishTags: AdminTelegramPublishTagsConnection;
  allTgBots: AdminTgBotsConnection;
  allUserSubgraphAccesses: AdminUserSubgraphAccessesConnection;
  allUserUserBans: AdminUserBansConnection;
  allUsers: AdminUsersConnection;
  allWaitListEmailRequests: AdminWaitListEmailRequestsConnection;
  allWaitListTgBotRequests: AdminWaitListTgBotRequestsConnection;
  apiKeyLogs: AdminApiKeyLogsConnection;
  auditLogs: AdminAuditLogsConnection;
  backgroundQueue?: Maybe<AdminBackgroundQueue>;
  boostyCredentials?: Maybe<AdminBoostyCredentials>;
  buildGitCommit: Scalars['String']['output'];
  cronJob?: Maybe<AdminCronJob>;
  healthChecks: Array<HealchCheck>;
  htmlInjection?: Maybe<AdminHtmlInjection>;
  latestConfig: AdminConfigVersion;
  noteAsset?: Maybe<AdminNoteAsset>;
  noteView?: Maybe<NoteView>;
  offer?: Maybe<AdminOffer>;
  patreonCredentials?: Maybe<AdminPatreonCredentials>;
  purchase?: Maybe<AdminPurchase>;
  recentlyModifiedNoteViews: Array<NoteView>;
  redirect?: Maybe<AdminRedirect>;
  subgraph?: Maybe<AdminSubgraph>;
  telegramAccount?: Maybe<AdminTelegramAccount>;
  telegramPublishNote?: Maybe<AdminTelegramPublishNote>;
  tgBot?: Maybe<AdminTgBot>;
  tgBotChats: AdminTgBotChatsConnection;
  tgChatMembers: AdminTgChatMembersConnection;
  tgChatSubgraphAccesses: AdminTgChatSubgraphAccessesConnection;
  user?: Maybe<AdminUser>;
  userSubgraphAccess?: Maybe<AdminUserSubgraphAccess>;
};


export type AdminQueryActiveUserSubgraphsArgs = {
  id: Scalars['Int64']['input'];
};


export type AdminQueryAllBoostyCredentialsArgs = {
  filter?: InputMaybe<AdminBoostyCredentialsFilterInput>;
};


export type AdminQueryAllLatestNoteViewsArgs = {
  filter?: InputMaybe<AdminLatestNoteViewsFilter>;
};


export type AdminQueryAllPatreonCredentialsArgs = {
  filter?: InputMaybe<AdminPatreonCredentialsFilterInput>;
};


export type AdminQueryAllTelegramPublishNotesArgs = {
  filter?: InputMaybe<AdminTelegramPublishNotesFilter>;
};


export type AdminQueryApiKeyLogsArgs = {
  filter: ApiKeyLogsFilterInput;
};


export type AdminQueryAuditLogsArgs = {
  filter: AdminAuditLogsFilterInput;
};


export type AdminQueryBackgroundQueueArgs = {
  id: Scalars['String']['input'];
};


export type AdminQueryBoostyCredentialsArgs = {
  id: Scalars['Int64']['input'];
};


export type AdminQueryCronJobArgs = {
  id: Scalars['Int64']['input'];
};


export type AdminQueryHtmlInjectionArgs = {
  id: Scalars['Int64']['input'];
};


export type AdminQueryNoteAssetArgs = {
  id: Scalars['Int64']['input'];
};


export type AdminQueryNoteViewArgs = {
  id: Scalars['String']['input'];
};


export type AdminQueryOfferArgs = {
  id: Scalars['Int64']['input'];
};


export type AdminQueryPatreonCredentialsArgs = {
  id: Scalars['Int64']['input'];
};


export type AdminQueryPurchaseArgs = {
  id: Scalars['String']['input'];
};


export type AdminQueryRedirectArgs = {
  id: Scalars['Int64']['input'];
};


export type AdminQuerySubgraphArgs = {
  id: Scalars['Int64']['input'];
};


export type AdminQueryTelegramAccountArgs = {
  id: Scalars['Int64']['input'];
};


export type AdminQueryTelegramPublishNoteArgs = {
  id: Scalars['Int64']['input'];
};


export type AdminQueryTgBotArgs = {
  id: Scalars['Int64']['input'];
};


export type AdminQueryTgBotChatsArgs = {
  filter: AdminTgBotChatsFilterInput;
};


export type AdminQueryTgChatMembersArgs = {
  filter: AdminTgChatMembersFilterInput;
};


export type AdminQueryTgChatSubgraphAccessesArgs = {
  filter: AdminTgChatSubgraphAccessesFilterInput;
};


export type AdminQueryUserArgs = {
  id: Scalars['Int64']['input'];
};


export type AdminQueryUserSubgraphAccessArgs = {
  id: Scalars['Int64']['input'];
};

export type AdminRedirect = {
  createdAt: Scalars['Time']['output'];
  createdBy: AdminUser;
  id: Scalars['Int64']['output'];
  ignoreCase: Scalars['Boolean']['output'];
  isRegex: Scalars['Boolean']['output'];
  pattern: Scalars['String']['output'];
  target: Scalars['String']['output'];
};

export type AdminRedirectsConnection = {
  nodes: Array<AdminRedirect>;
};

export type AdminRelease = {
  createdAt: Scalars['Time']['output'];
  createdBy: AdminUser;
  homeNote?: Maybe<NoteView>;
  homeNoteVersionId?: Maybe<Scalars['Int64']['output']>;
  id: Scalars['Int64']['output'];
  isLive: Scalars['Boolean']['output'];
  title: Scalars['String']['output'];
};

export type AdminReleasesConnection = {
  nodes: Array<AdminRelease>;
};

export type AdminSetTelegramAccountChatPublishInstantTagsInput = {
  accountId: Scalars['Int64']['input'];
  tagIds: Array<Scalars['Int64']['input']>;
  telegramChatId: Scalars['String']['input'];
};

export type AdminSetTelegramAccountChatPublishInstantTagsOrErrorPayload = AdminSetTelegramAccountChatPublishInstantTagsPayload | ErrorPayload;

export type AdminSetTelegramAccountChatPublishInstantTagsPayload = {
  success: Scalars['Boolean']['output'];
};

export type AdminSetTelegramAccountChatPublishTagsInput = {
  accountId: Scalars['Int64']['input'];
  tagIds: Array<Scalars['Int64']['input']>;
  telegramChatId: Scalars['String']['input'];
};

export type AdminSetTelegramAccountChatPublishTagsOrErrorPayload = AdminSetTelegramAccountChatPublishTagsPayload | ErrorPayload;

export type AdminSetTelegramAccountChatPublishTagsPayload = {
  success: Scalars['Boolean']['output'];
};

export type AdminSignOutTelegramAccountInput = {
  id: Scalars['Int64']['input'];
};

export type AdminSignOutTelegramAccountOrErrorPayload = AdminSignOutTelegramAccountPayload | ErrorPayload;

export type AdminSignOutTelegramAccountPayload = {
  success: Scalars['Boolean']['output'];
};

export type AdminStartTelegramAccountAuthInput = {
  apiHash: Scalars['String']['input'];
  apiId: Scalars['Int']['input'];
  phone: Scalars['String']['input'];
};

export type AdminStartTelegramAccountAuthOrErrorPayload = AdminStartTelegramAccountAuthPayload | ErrorPayload;

export type AdminStartTelegramAccountAuthPayload = {
  authState: AdminTelegramAccountAuthState;
};

export type AdminSubgraph = {
  color?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['Time']['output'];
  hidden: Scalars['Boolean']['output'];
  id: Scalars['Int64']['output'];
  name: Scalars['String']['output'];
};

export type AdminSubgraphsConnection = {
  nodes: Array<AdminSubgraph>;
};

export type AdminTelegramAccount = {
  createdAt: Scalars['Time']['output'];
  createdBy?: Maybe<User>;
  dialogs: Array<AdminTelegramAccountDialog>;
  displayName: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['Int64']['output'];
  isPremium: Scalars['Boolean']['output'];
  phone: Scalars['String']['output'];
};

export type AdminTelegramAccountAuthState = {
  passwordHint?: Maybe<Scalars['String']['output']>;
  phone: Scalars['String']['output'];
  state: AdminTelegramAccountAuthStateEnum;
};

export type AdminTelegramAccountAuthStateEnum =
  | 'AUTHORIZED'
  | 'ERROR'
  | 'WAITING_FOR_CODE'
  | 'WAITING_FOR_PASSWORD';

export type AdminTelegramAccountDialog = {
  id: Scalars['Int64']['output'];
  publishInstantTags: Array<AdminTelegramPublishTag>;
  publishTags: Array<AdminTelegramPublishTag>;
  title: Scalars['String']['output'];
  type: AdminTelegramAccountDialogType;
  username: Scalars['String']['output'];
};

export type AdminTelegramAccountDialogType =
  | 'channel'
  | 'chat'
  | 'user';

export type AdminTelegramAccountsConnection = {
  nodes: Array<AdminTelegramAccount>;
};

export type AdminTelegramPublishNote = {
  chats: Array<AdminTgBotChat>;
  createdAt: Scalars['Time']['output'];
  errorCount: Scalars['Int64']['output'];
  id: Scalars['Int64']['output'];
  /** latest or published NoteView depending on the status */
  noteView: NoteView;
  post: TelegramPost;
  publishAt: Scalars['Time']['output'];
  publishedAt?: Maybe<Scalars['Time']['output']>;
  publishedVersionID?: Maybe<Scalars['Int64']['output']>;
  secondsUntilPublish: Scalars['Int64']['output'];
  status: Scalars['String']['output'];
  tags: Array<AdminTelegramPublishTag>;
};

export type AdminTelegramPublishNotesConnection = {
  count: Scalars['Int64']['output'];
  nodes: Array<AdminTelegramPublishNote>;
};

export type AdminTelegramPublishNotesFilter = {
  includeOutdated?: InputMaybe<Scalars['Boolean']['input']>;
  includeSent?: InputMaybe<Scalars['Boolean']['input']>;
};

export type AdminTelegramPublishTag = {
  createdAt: Scalars['Time']['output'];
  id: Scalars['Int64']['output'];
  label: Scalars['String']['output'];
};

export type AdminTelegramPublishTagsConnection = {
  nodes: Array<AdminTelegramPublishTag>;
};

export type AdminTgBot = {
  createdAt: Scalars['Time']['output'];
  createdBy: AdminUser;
  description: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['Int64']['output'];
  name: Scalars['String']['output'];
};

export type AdminTgBotChat = {
  addedAt: Scalars['Time']['output'];
  canInvite: Scalars['Boolean']['output'];
  chatTitle: Scalars['String']['output'];
  chatType: Scalars['String']['output'];
  id: Scalars['Int64']['output'];
  memberCount: Scalars['Int']['output'];
  publishInstantTags: Array<AdminTelegramPublishTag>;
  publishTags: Array<AdminTelegramPublishTag>;
  removedAt?: Maybe<Scalars['Time']['output']>;
  subgraphAccesses: Array<AdminTgChatSubgraphAccess>;
  subgraphInvites: Array<AdminTgBotChatSubgraphInvite>;
};

export type AdminTgBotChatSubgraphInvite = {
  chat: AdminTgBotChat;
  chatId: Scalars['Int64']['output'];
  createdAt: Scalars['Time']['output'];
  id: Scalars['String']['output'];
  subgraph: AdminSubgraph;
  subgraphId: Scalars['Int64']['output'];
};

export type AdminTgBotChatsConnection = {
  nodes: Array<AdminTgBotChat>;
};

export type AdminTgBotChatsFilterInput = {
  botId?: InputMaybe<Scalars['Int64']['input']>;
  canInvite?: InputMaybe<Scalars['Boolean']['input']>;
  includeRemoved?: InputMaybe<Scalars['Boolean']['input']>;
};

export type AdminTgBotsConnection = {
  nodes: Array<AdminTgBot>;
};

export type AdminTgChatMember = {
  chatId: Scalars['Int64']['output'];
  createdAt: Scalars['Time']['output'];
  profile?: Maybe<AdminTgUserProfile>;
  userId: Scalars['Int64']['output'];
};

export type AdminTgChatMembersConnection = {
  nodes: Array<AdminTgChatMember>;
};

export type AdminTgChatMembersFilterInput = {
  chatId: Scalars['Int64']['input'];
};

export type AdminTgChatSubgraphAccess = {
  chat: AdminTgBotChat;
  chatId: Scalars['Int64']['output'];
  createdAt: Scalars['Time']['output'];
  id: Scalars['Int64']['output'];
  subgraph: AdminSubgraph;
  subgraphId: Scalars['Int64']['output'];
};

export type AdminTgChatSubgraphAccessesConnection = {
  nodes: Array<AdminTgChatSubgraphAccess>;
};

export type AdminTgChatSubgraphAccessesFilterInput = {
  chatId?: InputMaybe<Scalars['Int64']['input']>;
  subgraphId?: InputMaybe<Scalars['Int64']['input']>;
};

export type AdminTgUserProfile = {
  botId: Scalars['Int64']['output'];
  chatId: Scalars['Int64']['output'];
  createdAt: Scalars['Time']['output'];
  firstName?: Maybe<Scalars['String']['output']>;
  lastName?: Maybe<Scalars['String']['output']>;
  sha256Hash: Scalars['String']['output'];
  username?: Maybe<Scalars['String']['output']>;
};

export type AdminUpdateTelegramAccountInput = {
  displayName?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['Int64']['input'];
};

export type AdminUpdateTelegramAccountOrErrorPayload = AdminUpdateTelegramAccountPayload | ErrorPayload;

export type AdminUpdateTelegramAccountPayload = {
  account: AdminTelegramAccount;
};

export type AdminUser = {
  ban?: Maybe<UserBan>;
  createdAt: Scalars['Time']['output'];
  email?: Maybe<Scalars['String']['output']>;
  id: Scalars['Int64']['output'];
};

export type AdminUserBansConnection = {
  nodes: Array<UserBan>;
};

export type AdminUserSubgraphAccess = {
  createdAt: Scalars['Time']['output'];
  expiresAt?: Maybe<Scalars['Time']['output']>;
  id: Scalars['Int64']['output'];
  subgraph: AdminSubgraph;
  subgraphId: Scalars['Int64']['output'];
  user: AdminUser;
  userId: Scalars['Int64']['output'];
};

export type AdminUserSubgraphAccessesConnection = {
  nodes: Array<AdminUserSubgraphAccess>;
};

export type AdminUsersConnection = {
  nodes: Array<AdminUser>;
};

export type AdminWaitListEmailRequest = {
  createdAt: Scalars['Time']['output'];
  email: Scalars['String']['output'];
  ip?: Maybe<Scalars['String']['output']>;
  notePath: Scalars['String']['output'];
};

export type AdminWaitListEmailRequestsConnection = {
  nodes: Array<AdminWaitListEmailRequest>;
};

export type AdminWaitListTgBotRequest = {
  botName: Scalars['String']['output'];
  chatId: Scalars['Int64']['output'];
  createdAt: Scalars['Time']['output'];
  notePath: Scalars['String']['output'];
  notePathId: Scalars['Int64']['output'];
};

export type AdminWaitListTgBotRequestsConnection = {
  nodes: Array<AdminWaitListTgBotRequest>;
};

export type ApiKeyLogsFilterInput = {
  apiKeyId?: InputMaybe<Scalars['Int64']['input']>;
};

export type AuditLogLevelEnum =
  | 'DEBUG'
  | 'ERROR'
  | 'INFO'
  | 'UNKNOWN'
  | 'WARNING';

export type BanUserInput = {
  reason: Scalars['String']['input'];
  userId: Scalars['Int64']['input'];
};

export type BanUserOrErrorPayload = BanUserPayload | ErrorPayload;

export type BanUserPayload = {
  user: AdminUser;
  userId: Scalars['Int64']['output'];
};

export type BoostyCredentialsStateEnum =
  | 'ACTIVE'
  | 'DELETED';

export type ClearBackgroundQueueInput = {
  id: Scalars['String']['input'];
};

export type ClearBackgroundQueueOrErrorPayload = ClearBackgroundQueuePayload | ErrorPayload;

export type ClearBackgroundQueuePayload = {
  deletedCount: Scalars['Int64']['output'];
  queue: AdminBackgroundQueue;
};

export type CommitNotesOrErrorPayload = CommitNotesPayload | ErrorPayload;

export type CommitNotesPayload = {
  success: Scalars['Boolean']['output'];
};

export type CreateApiKeyInput = {
  description: Scalars['String']['input'];
};

export type CreateApiKeyOrErrorPayload = CreateApiKeyPayload | ErrorPayload;

export type CreateApiKeyPayload = {
  apiKey: AdminApiKey;
  value: Scalars['String']['output'];
};

export type CreateBoostyCredentialsInput = {
  authData: Scalars['String']['input'];
  blogName: Scalars['String']['input'];
  deviceId: Scalars['String']['input'];
};

export type CreateBoostyCredentialsOrErrorPayload = CreateBoostyCredentialsPayload | ErrorPayload;

export type CreateBoostyCredentialsPayload = {
  boostyCredentials: AdminBoostyCredentials;
};

export type CreateConfigVersionInput = {
  defaultLayout: Scalars['String']['input'];
  robotsTxt: Scalars['String']['input'];
  showDraftVersions: Scalars['Boolean']['input'];
  timezone: Scalars['String']['input'];
};

export type CreateConfigVersionOrErrorPayload = CreateConfigVersionPayload | ErrorPayload;

export type CreateConfigVersionPayload = {
  configVersion: AdminConfigVersion;
};

export type CreateEmailWaitListRequestInput = {
  email: Scalars['String']['input'];
  pathId: Scalars['Int64']['input'];
};

export type CreateEmailWaitListRequestOrErrorPayload = CreateEmailWaitListRequestPayload | ErrorPayload;

export type CreateEmailWaitListRequestPayload = {
  success: Scalars['Boolean']['output'];
};

export type CreateGitTokenInput = {
  canPull: Scalars['Boolean']['input'];
  canPush: Scalars['Boolean']['input'];
  description: Scalars['String']['input'];
};

export type CreateGitTokenOrErrorPayload = CreateGitTokenPayload | ErrorPayload;

export type CreateGitTokenPayload = {
  gitToken: AdminGitToken;
  value: Scalars['String']['output'];
};

export type CreateHtmlInjectionInput = {
  activeFrom?: InputMaybe<Scalars['Time']['input']>;
  activeTo?: InputMaybe<Scalars['Time']['input']>;
  content: Scalars['String']['input'];
  description: Scalars['String']['input'];
  placement: Scalars['String']['input'];
  position: Scalars['Int']['input'];
};

export type CreateHtmlInjectionOrErrorPayload = CreateHtmlInjectionPayload | ErrorPayload;

export type CreateHtmlInjectionPayload = {
  htmlInjection: AdminHtmlInjection;
};

export type CreateNotFoundIgnoredPatternInput = {
  pattern: Scalars['String']['input'];
};

export type CreateNotFoundIgnoredPatternOrErrorPayload = CreateNotFoundIgnoredPatternPayload | ErrorPayload;

export type CreateNotFoundIgnoredPatternPayload = {
  notFoundIgnoredPattern: AdminNotFoundIgnoredPattern;
};

export type CreateOfferInput = {
  endsAt?: InputMaybe<Scalars['Time']['input']>;
  lifetime?: InputMaybe<Scalars['String']['input']>;
  priceUSD: Scalars['Float']['input'];
  startsAt?: InputMaybe<Scalars['Time']['input']>;
  subgraphIds: Array<Scalars['Int64']['input']>;
};

export type CreateOfferOrErrorPayload = CreateOfferPayload | ErrorPayload;

export type CreateOfferPayload = {
  offer: AdminOffer;
};

export type CreatePatreonCredentialsInput = {
  creatorAccessToken: Scalars['String']['input'];
};

export type CreatePatreonCredentialsOrErrorPayload = CreatePatreonCredentialsPayload | ErrorPayload;

export type CreatePatreonCredentialsPayload = {
  patreonCredentials: AdminPatreonCredentials;
};

export type CreatePaymentLinkInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  offerId: Scalars['String']['input'];
  paymentType: PaymentType;
  returnPath: Scalars['String']['input'];
};

export type CreatePaymentLinkOrErrorPayload = CreatePaymentLinkPayload | ErrorPayload;

export type CreatePaymentLinkPayload = {
  redirectUrl: Scalars['String']['output'];
  token?: Maybe<Scalars['String']['output']>;
};

export type CreateRedirectInput = {
  ignoreCase: Scalars['Boolean']['input'];
  isRegex: Scalars['Boolean']['input'];
  pattern: Scalars['String']['input'];
  target: Scalars['String']['input'];
};

export type CreateRedirectOrErrorPayload = CreateRedirectPayload | ErrorPayload;

export type CreateRedirectPayload = {
  redirect: AdminRedirect;
};

export type CreateReleaseInput = {
  homeNoteVersionId?: InputMaybe<Scalars['Int64']['input']>;
  title: Scalars['String']['input'];
};

export type CreateReleaseOrErrorPayload = CreateReleasePayload | ErrorPayload;

export type CreateReleasePayload = {
  release: AdminRelease;
};

export type CreateTgBotInput = {
  description: Scalars['String']['input'];
  token: Scalars['String']['input'];
};

export type CreateTgBotOrErrorPayload = CreateTgBotPayload | ErrorPayload;

export type CreateTgBotPayload = {
  tgBot: AdminTgBot;
};

export type CreateUserInput = {
  email: Scalars['String']['input'];
};

export type CreateUserOrErrorPayload = CreateUserPayload | ErrorPayload;

export type CreateUserPayload = {
  user: AdminUser;
};

export type CronJobExecutionStatus =
  | 'COMPLETED'
  | 'FAILED'
  | 'PENDING'
  | 'RUNNING';

export type DeleteBoostyCredentialsInput = {
  id: Scalars['Int64']['input'];
};

export type DeleteBoostyCredentialsOrErrorPayload = DeleteBoostyCredentialsPayload | ErrorPayload;

export type DeleteBoostyCredentialsPayload = {
  boostyCredentials: AdminBoostyCredentials;
  deletedId: Scalars['Int64']['output'];
};

export type DeleteHtmlInjectionInput = {
  id: Scalars['Int64']['input'];
};

export type DeleteHtmlInjectionOrErrorPayload = DeleteHtmlInjectionPayload | ErrorPayload;

export type DeleteHtmlInjectionPayload = {
  deletedId: Scalars['Int64']['output'];
};

export type DeleteNotFoundIgnoredPatternInput = {
  id: Scalars['Int64']['input'];
};

export type DeleteNotFoundIgnoredPatternOrErrorPayload = DeleteNotFoundIgnoredPatternPayload | ErrorPayload;

export type DeleteNotFoundIgnoredPatternPayload = {
  deletedId: Scalars['Int64']['output'];
};

export type DeletePatreonCredentialsInput = {
  id: Scalars['Int64']['input'];
};

export type DeletePatreonCredentialsOrErrorPayload = DeletePatreonCredentialsPayload | ErrorPayload;

export type DeletePatreonCredentialsPayload = {
  deletedId: Scalars['Int64']['output'];
  patreonCredentials: AdminPatreonCredentials;
};

export type DeleteRedirectInput = {
  id: Scalars['Int64']['input'];
};

export type DeleteRedirectOrErrorPayload = DeleteRedirectPayload | ErrorPayload;

export type DeleteRedirectPayload = {
  id: Scalars['Int64']['output'];
};

export type DisableApiKeyInput = {
  id: Scalars['Int64']['input'];
};

export type DisableApiKeyOrErrorPayload = DisableApiKeyPayload | ErrorPayload;

export type DisableApiKeyPayload = {
  apiKey: AdminApiKey;
};

export type DisableGitTokenInput = {
  id: Scalars['Int64']['input'];
};

export type DisableGitTokenOrErrorPayload = DisableGitTokenPayload | ErrorPayload;

export type DisableGitTokenPayload = {
  gitToken: AdminGitToken;
};

export type ErrorPayload = {
  byFields: Array<FieldMessage>;
  message: Scalars['String']['output'];
};

export type FieldMessage = {
  name: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

export type GenerateTgAttachCodeInput = {
  botId: Scalars['Int64']['input'];
};

export type GenerateTgAttachCodeOrErrorPayload = ErrorPayload | GenerateTgAttachCodePayload;

export type GenerateTgAttachCodePayload = {
  code: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type HealchCheck = {
  description: Scalars['String']['output'];
  id: Scalars['String']['output'];
  status: HealthCheckStatus;
};

export type HealthCheckStatus =
  | 'CRITICAL'
  | 'OK'
  | 'WARNING';

export type HideNotesInput = {
  paths: Array<Scalars['String']['input']>;
};

export type HideNotesOrErrorPayload = ErrorPayload | HideNotesPayload;

export type HideNotesPayload = {
  success: Scalars['Boolean']['output'];
};

export type LastNoteReadAtInput = {
  pathId: Scalars['Int64']['input'];
};

export type MakeReleaseLiveInput = {
  id: Scalars['Int64']['input'];
};

export type MakeReleaseLiveOrErrorPayload = ErrorPayload | MakeReleaseLivePayload;

export type MakeReleaseLivePayload = {
  release: AdminRelease;
};

export type Mutation = {
  admin: AdminMutation;
  /** X-Api-Key header must be set. */
  commitNotes: CommitNotesOrErrorPayload;
  createEmailWaitListRequest: CreateEmailWaitListRequestOrErrorPayload;
  createPaymentLink: CreatePaymentLinkOrErrorPayload;
  generateTgAttachCode: GenerateTgAttachCodeOrErrorPayload;
  /** X-Api-Key header must be set. */
  hideNotes: HideNotesOrErrorPayload;
  /** X-Api-Key header must be set. */
  pushNotes: PushNotesOrErrorPayload;
  requestEmailSignInCode: RequestEmailSignInCodeOrErrorPayload;
  signInByEmail: SignInOrErrorPayload;
  signOut: SignOutOrErrorPayload;
  toggleFavoriteNote: ToggleFavoriteNoteOrErrorPayload;
  /** X-Api-Key header must be set. */
  uploadNoteAsset: UploadNoteAssetOrErrorPayload;
};


export type MutationCreateEmailWaitListRequestArgs = {
  input: CreateEmailWaitListRequestInput;
};


export type MutationCreatePaymentLinkArgs = {
  input: CreatePaymentLinkInput;
};


export type MutationGenerateTgAttachCodeArgs = {
  input: GenerateTgAttachCodeInput;
};


export type MutationHideNotesArgs = {
  input: HideNotesInput;
};


export type MutationPushNotesArgs = {
  input: PushNotesInput;
};


export type MutationRequestEmailSignInCodeArgs = {
  input: RequestEmailSignInCodeInput;
};


export type MutationSignInByEmailArgs = {
  input: SignInByEmailInput;
};


export type MutationToggleFavoriteNoteArgs = {
  input: ToggleFavoriteNoteInput;
};


export type MutationUploadNoteAssetArgs = {
  input: UploadNoteAssetInput;
};

export type NoteAssetReplaceT = {
  absolutePath: Scalars['String']['output'];
  hash: Scalars['String']['output'];
  id: Scalars['String']['output'];
  url: Scalars['String']['output'];
};

export type NoteInput = {
  path?: InputMaybe<Scalars['String']['input']>;
  pathId?: InputMaybe<Scalars['Int64']['input']>;
  referer: Scalars['String']['input'];
};

export type NotePath = {
  assetReplaces: Array<NoteAssetReplaceT>;
  content: Scalars['String']['output'];
  latestContentHash: Scalars['String']['output'];
  latestNoteView?: Maybe<NoteView>;
  value: Scalars['String']['output'];
};

export type NotePathsFilter = {
  /**
   * LIKE pattern with % and _ wildcards supported.
   * For example, to find all note paths starting with "myfolder/", use "myfolder/%".
   */
  like?: InputMaybe<Scalars['String']['input']>;
  /** Only return these specific note paths. Search and like will be ignored if paths is set. */
  paths?: InputMaybe<Array<Scalars['String']['input']>>;
  /** Full-text search on note paths. like will be ignored if search is set. */
  search?: InputMaybe<Scalars['String']['input']>;
};

export type NoteTocItem = {
  id: Scalars['String']['output'];
  level: Scalars['Int']['output'];
  title: Scalars['String']['output'];
};

export type NoteView = {
  assetReplaces: Array<NoteAssetReplaceT>;
  content: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  free: Scalars['Boolean']['output'];
  graphPosition?: Maybe<Vector2>;
  html: Scalars['String']['output'];
  id: Scalars['String']['output'];
  inLinks: Array<NoteView>;
  isHomePage: Scalars['Boolean']['output'];
  meta: Array<NoteViewMeta>;
  path: Scalars['String']['output'];
  pathId: Scalars['Int64']['output'];
  permalink: Scalars['String']['output'];
  subgraphNames: Array<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  toc: Array<NoteTocItem>;
  versionId: Scalars['Int64']['output'];
  warnings: Array<NoteWarning>;
};

export type NoteViewMeta = {
  key: Scalars['String']['output'];
  raw: Scalars['String']['output'];
};

export type NoteWarning = {
  level: NoteWarningLevelEnum;
  message: Scalars['String']['output'];
};

export type NoteWarningLevelEnum =
  | 'CRITICAL'
  | 'INFO'
  | 'WARNING';

export type Offer = {
  id: Scalars['String']['output'];
  priceUSD: Scalars['Float']['output'];
  subgraphs: Array<Subgraph>;
};

export type PatreonCredentialsStateEnum =
  | 'ACTIVE'
  | 'DELETED';

export type PaymentType =
  | 'CRYPTO';

export type PublicNote = {
  html: Scalars['String']['output'];
  pathId: Scalars['Int64']['output'];
  title: Scalars['String']['output'];
  toc: Array<NoteTocItem>;
};

export type Purchase = {
  id: Scalars['String']['output'];
  status: Scalars['String']['output'];
  successful: Scalars['Boolean']['output'];
};

export type PushNoteInput = {
  content: Scalars['String']['input'];
  path: Scalars['String']['input'];
};

export type PushNotesInput = {
  skipCommit?: InputMaybe<Scalars['Boolean']['input']>;
  updates: Array<PushNoteInput>;
};

export type PushNotesOrErrorPayload = ErrorPayload | PushNotesPayload;

export type PushNotesPayload = {
  notes: Array<PushedNote>;
};

export type PushedNote = {
  assets: Array<PushedNoteAsset>;
  id: Scalars['Int64']['output'];
  path: Scalars['String']['output'];
};

export type PushedNoteAsset = {
  absolutePath: Scalars['String']['output'];
  assetId: Scalars['Int64']['output'];
  id: Scalars['String']['output'];
  path: Scalars['String']['output'];
  sha256Hash?: Maybe<Scalars['String']['output']>;
  url: Scalars['String']['output'];
};

export type Query = {
  admin: AdminQuery;
  note?: Maybe<PublicNote>;
  /** X-Api-Key header must be set. */
  notePaths: Array<NotePath>;
  search: SearchConnection;
  viewer: Viewer;
};


export type QueryNoteArgs = {
  input: NoteInput;
};


export type QueryNotePathsArgs = {
  filter?: InputMaybe<NotePathsFilter>;
};


export type QuerySearchArgs = {
  input: SearchInput;
};

export type RefreshBoostyDataInput = {
  credentialsId: Scalars['Int64']['input'];
};

export type RefreshBoostyDataOrErrorPayload = ErrorPayload | RefreshBoostyDataPayload;

export type RefreshBoostyDataPayload = {
  credentials: AdminBoostyCredentials;
  credentialsID: Scalars['Int64']['output'];
  success: Scalars['Boolean']['output'];
};

export type RefreshPatreonDataInput = {
  credentialsId: Scalars['Int64']['input'];
};

export type RefreshPatreonDataOrErrorPayload = ErrorPayload | RefreshPatreonDataPayload;

export type RefreshPatreonDataPayload = {
  credentials: AdminPatreonCredentials;
  credentialsID: Scalars['Int64']['output'];
  success: Scalars['Boolean']['output'];
};

export type RemoveExpiredTgChatMembersInput = {
  chatId?: InputMaybe<Scalars['Int64']['input']>;
  userId?: InputMaybe<Scalars['Int64']['input']>;
};

export type RemoveExpiredTgChatMembersOrErrorPayload = ErrorPayload | RemoveExpiredTgChatMembersPayload;

export type RemoveExpiredTgChatMembersPayload = {
  errors: Array<Scalars['String']['output']>;
  removedCount: Scalars['Int']['output'];
};

export type RequestEmailSignInCodeInput = {
  email: Scalars['String']['input'];
};

export type RequestEmailSignInCodeOrErrorPayload = ErrorPayload | RequestEmailSignInCodePayload;

export type RequestEmailSignInCodePayload = {
  success: Scalars['Boolean']['output'];
};

export type ResetNotFoundPathInput = {
  id: Scalars['Int64']['input'];
};

export type ResetNotFoundPathOrErrorPayload = ErrorPayload | ResetNotFoundPathPayload;

export type ResetNotFoundPathPayload = {
  notFoundPath: AdminNotFoundPath;
};

export type ResetTelegramPublishNoteInput = {
  id: Scalars['Int64']['input'];
};

export type ResetTelegramPublishNoteOrErrorPayload = ErrorPayload | ResetTelegramPublishNotePayload;

export type ResetTelegramPublishNotePayload = {
  publishNote: AdminTelegramPublishNote;
};

export type RestoreBoostyCredentialsInput = {
  id: Scalars['Int64']['input'];
};

export type RestoreBoostyCredentialsOrErrorPayload = ErrorPayload | RestoreBoostyCredentialsPayload;

export type RestoreBoostyCredentialsPayload = {
  boostyCredentials: AdminBoostyCredentials;
};

export type RestorePatreonCredentialsInput = {
  id: Scalars['Int64']['input'];
};

export type RestorePatreonCredentialsOrErrorPayload = ErrorPayload | RestorePatreonCredentialsPayload;

export type RestorePatreonCredentialsPayload = {
  patreonCredentials: AdminPatreonCredentials;
};

export type Role =
  | 'ADMIN'
  | 'GUEST'
  | 'USER';

export type RunCronJobInput = {
  id: Scalars['Int64']['input'];
};

export type RunCronJobOrErrorPayload = ErrorPayload | RunCronJobPayload;

export type RunCronJobPayload = {
  execution: AdminCronJobExecution;
};

export type SearchConnection = {
  nodes: Array<SearchResult>;
  totalCount: Scalars['Int64']['output'];
};

export type SearchInput = {
  query: Scalars['String']['input'];
};

export type SearchResult = {
  document?: Maybe<SearchResultDocument>;
  highlightedContent: Array<Scalars['String']['output']>;
  highlightedTitle?: Maybe<Scalars['String']['output']>;
  url: Scalars['String']['output'];
};

export type SearchResultDocument = PublicNote;

export type SendTelegramPublishNoteNowInput = {
  id: Scalars['Int64']['input'];
};

export type SendTelegramPublishNoteNowOrErrorPayload = ErrorPayload | SendTelegramPublishNoteNowPayload;

export type SendTelegramPublishNoteNowPayload = {
  publishNote: AdminTelegramPublishNote;
};

export type SetBoostyTierSubgraphsInput = {
  subgraphIds: Array<Scalars['Int64']['input']>;
  tierId: Scalars['Int64']['input'];
};

export type SetBoostyTierSubgraphsOrErrorPayload = ErrorPayload | SetBoostyTierSubgraphsPayload;

export type SetBoostyTierSubgraphsPayload = {
  success: Scalars['Boolean']['output'];
  tier: AdminBoostyTier;
};

export type SetPatreonTierSubgraphsInput = {
  subgraphIds: Array<Scalars['Int64']['input']>;
  tierId: Scalars['Int64']['input'];
};

export type SetPatreonTierSubgraphsOrErrorPayload = ErrorPayload | SetPatreonTierSubgraphsPayload;

export type SetPatreonTierSubgraphsPayload = {
  success: Scalars['Boolean']['output'];
  tier: AdminPatreonTier;
};

export type SetTgChatPublishInstantTagsInput = {
  chatId: Scalars['Int64']['input'];
  tagIds: Array<Scalars['Int64']['input']>;
};

export type SetTgChatPublishInstantTagsOrErrorPayload = ErrorPayload | SetTgChatPublishInstantTagsPayload;

export type SetTgChatPublishInstantTagsPayload = {
  chat: AdminTgBotChat;
  success: Scalars['Boolean']['output'];
};

export type SetTgChatPublishTagsInput = {
  chatId: Scalars['Int64']['input'];
  tagIds: Array<Scalars['Int64']['input']>;
};

export type SetTgChatPublishTagsOrErrorPayload = ErrorPayload | SetTgChatPublishTagsPayload;

export type SetTgChatPublishTagsPayload = {
  chat: AdminTgBotChat;
  success: Scalars['Boolean']['output'];
};

export type SetTgChatSubgraphInvitesInput = {
  chatId: Scalars['Int64']['input'];
  subgraphIds: Array<Scalars['Int64']['input']>;
};

export type SetTgChatSubgraphInvitesOrErrorPayload = ErrorPayload | SetTgChatSubgraphInvitesPayload;

export type SetTgChatSubgraphInvitesPayload = {
  chat: AdminTgBotChat;
  success: Scalars['Boolean']['output'];
};

export type SetTgChatSubgraphsInput = {
  chatId: Scalars['Int64']['input'];
  subgraphIds: Array<Scalars['Int64']['input']>;
};

export type SetTgChatSubgraphsOrErrorPayload = ErrorPayload | SetTgChatSubgraphsPayload;

export type SetTgChatSubgraphsPayload = {
  chat: AdminTgBotChat;
  success: Scalars['Boolean']['output'];
};

export type SignInByEmailInput = {
  code: Scalars['String']['input'];
  email: Scalars['String']['input'];
};

export type SignInOrErrorPayload = ErrorPayload | SignInPayload;

export type SignInPayload = {
  token: Scalars['String']['output'];
  viewer: Viewer;
};

export type SignOutOrErrorPayload = ErrorPayload | SignOutPayload;

export type SignOutPayload = {
  viewer: Viewer;
};

export type StartBackgroundQueueInput = {
  id: Scalars['String']['input'];
};

export type StartBackgroundQueueOrErrorPayload = ErrorPayload | StartBackgroundQueuePayload;

export type StartBackgroundQueuePayload = {
  queues: Array<AdminBackgroundQueue>;
};

export type StopBackgroundQueueInput = {
  id: Scalars['String']['input'];
};

export type StopBackgroundQueueOrErrorPayload = ErrorPayload | StopBackgroundQueuePayload;

export type StopBackgroundQueuePayload = {
  queues: Array<AdminBackgroundQueue>;
};

export type Subgraph = {
  homePath: Scalars['String']['output'];
  name: Scalars['String']['output'];
  offers: Array<Offer>;
};

export type SubgraphWaitList = {
  emailAllowed: Scalars['Boolean']['output'];
  tgBotUrl?: Maybe<Scalars['String']['output']>;
};

export type TelegramPost = {
  content: Scalars['String']['output'];
  warnings: Array<Scalars['String']['output']>;
};

export type TgBot = {
  description: Scalars['String']['output'];
  id: Scalars['Int64']['output'];
};

export type ToggleFavoriteNoteInput = {
  pathId: Scalars['Int64']['input'];
  value: Scalars['Boolean']['input'];
};

export type ToggleFavoriteNoteOrErrorPayload = ErrorPayload | ToggleFavoriteNotePayload;

export type ToggleFavoriteNotePayload = {
  favoriteNotes: Array<PublicNote>;
  success: Scalars['Boolean']['output'];
};

export type UnbanUserInput = {
  userId: Scalars['Int64']['input'];
};

export type UnbanUserOrErrorPayload = ErrorPayload | UnbanUserPayload;

export type UnbanUserPayload = {
  user: AdminUser;
  userId: Scalars['Int64']['output'];
};

export type UpdateBoostyCredentialsInput = {
  authData?: InputMaybe<Scalars['String']['input']>;
  blogName?: InputMaybe<Scalars['String']['input']>;
  deviceId?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int64']['input'];
};

export type UpdateBoostyCredentialsOrErrorPayload = ErrorPayload | UpdateBoostyCredentialsPayload;

export type UpdateBoostyCredentialsPayload = {
  boostyCredentials: AdminBoostyCredentials;
};

export type UpdateCronJobInput = {
  enabled: Scalars['Boolean']['input'];
  expression: Scalars['String']['input'];
  id: Scalars['Int64']['input'];
};

export type UpdateCronJobOrErrorPayload = ErrorPayload | UpdateCronJobPayload;

export type UpdateCronJobPayload = {
  cronJob: AdminCronJob;
};

export type UpdateHtmlInjectionInput = {
  activeFrom?: InputMaybe<Scalars['Time']['input']>;
  activeTo?: InputMaybe<Scalars['Time']['input']>;
  content: Scalars['String']['input'];
  description: Scalars['String']['input'];
  id: Scalars['Int64']['input'];
  placement: Scalars['String']['input'];
  position: Scalars['Int']['input'];
};

export type UpdateHtmlInjectionOrErrorPayload = ErrorPayload | UpdateHtmlInjectionPayload;

export type UpdateHtmlInjectionPayload = {
  htmlInjection: AdminHtmlInjection;
};

export type UpdateNotFoundIgnoredPatternInput = {
  id: Scalars['Int64']['input'];
  pattern: Scalars['String']['input'];
};

export type UpdateNotFoundIgnoredPatternOrErrorPayload = ErrorPayload | UpdateNotFoundIgnoredPatternPayload;

export type UpdateNotFoundIgnoredPatternPayload = {
  notFoundIgnoredPattern: AdminNotFoundIgnoredPattern;
};

export type UpdateNoteGraphPositionInput = {
  pathId: Scalars['Int64']['input'];
  x: Scalars['Float']['input'];
  y: Scalars['Float']['input'];
};

export type UpdateNoteGraphPositionsInput = {
  positions: Array<UpdateNoteGraphPositionInput>;
};

export type UpdateNoteGraphPositionsOrErrorPayload = ErrorPayload | UpdateNoteGraphPositionsPayload;

export type UpdateNoteGraphPositionsPayload = {
  success: Scalars['Boolean']['output'];
  updatedNoteViews: Array<NoteView>;
};

export type UpdateOfferInput = {
  endsAt?: InputMaybe<Scalars['Time']['input']>;
  id: Scalars['Int64']['input'];
  lifetime?: InputMaybe<Scalars['String']['input']>;
  priceUSD?: InputMaybe<Scalars['Float']['input']>;
  startsAt?: InputMaybe<Scalars['Time']['input']>;
  subgraphIds?: InputMaybe<Array<Scalars['Int64']['input']>>;
};

export type UpdateOfferOrErrorPayload = ErrorPayload | UpdateOfferPayload;

export type UpdateOfferPayload = {
  offer: AdminOffer;
};

export type UpdateRedirectInput = {
  id: Scalars['Int64']['input'];
  ignoreCase: Scalars['Boolean']['input'];
  isRegex: Scalars['Boolean']['input'];
  pattern: Scalars['String']['input'];
  target: Scalars['String']['input'];
};

export type UpdateRedirectOrErrorPayload = ErrorPayload | UpdateRedirectPayload;

export type UpdateRedirectPayload = {
  redirect: AdminRedirect;
};

export type UpdateSubgraphInput = {
  color: Scalars['String']['input'];
  hidden: Scalars['Boolean']['input'];
  id: Scalars['Int64']['input'];
};

export type UpdateSubgraphOrErrorPayload = ErrorPayload | UpdateSubgraphPayload;

export type UpdateSubgraphPayload = {
  subgraph: AdminSubgraph;
};

export type UpdateTgBotInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  enabled?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['Int64']['input'];
};

export type UpdateTgBotOrErrorPayload = ErrorPayload | UpdateTgBotPayload;

export type UpdateTgBotPayload = {
  tgBot: AdminTgBot;
};

export type UpdateUserInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['Int64']['input'];
};

export type UpdateUserOrErrorPayload = ErrorPayload | UpdateUserPayload;

export type UpdateUserPayload = {
  user: AdminUser;
};

export type UpdateUserSubgraphAccessInput = {
  expiresAt?: InputMaybe<Scalars['Time']['input']>;
  id: Scalars['Int64']['input'];
  subgraphId?: InputMaybe<Scalars['Int64']['input']>;
};

export type UpdateUserSubgraphAccessOrErrorPayload = ErrorPayload | UpdateUserSubgraphAccessPayload;

export type UpdateUserSubgraphAccessPayload = {
  userSubgraphAccess: UserSubgraphAccess;
};

export type UploadNoteAssetInput = {
  absolutePath: Scalars['String']['input'];
  file: Scalars['Upload']['input'];
  noteId: Scalars['Int64']['input'];
  path: Scalars['String']['input'];
  sha256Hash: Scalars['String']['input'];
  skipCommit?: InputMaybe<Scalars['Boolean']['input']>;
};

export type UploadNoteAssetOrErrorPayload = ErrorPayload | UploadNoteAssetPayload;

export type UploadNoteAssetPayload = {
  uploadSkipped: Scalars['Boolean']['output'];
};

export type User = {
  email?: Maybe<Scalars['String']['output']>;
  favoriteNotes: Array<PublicNote>;
  subgraphAccesses: Array<UserSubgraphAccess>;
};

export type UserBan = {
  bannedBy?: Maybe<Admin>;
  createdAt: Scalars['Time']['output'];
  reason: Scalars['String']['output'];
  user: AdminUser;
  userId: Scalars['Int64']['output'];
};

export type UserSubgraphAccess = {
  createdAt: Scalars['Time']['output'];
  expiresAt?: Maybe<Scalars['Time']['output']>;
  id: Scalars['ID']['output'];
  subgraph: Subgraph;
};

export type Vector2 = {
  x: Scalars['Float']['output'];
  y: Scalars['Float']['output'];
};

export type Viewer = {
  activePurchases: Array<Purchase>;
  id: Scalars['ID']['output'];
  lastNoteReadAt?: Maybe<Scalars['Time']['output']>;
  offers?: Maybe<ViewerOffers>;
  role: Role;
  tgBots: Array<TgBot>;
  user?: Maybe<User>;
};


export type ViewerLastNoteReadAtArgs = {
  input: LastNoteReadAtInput;
};


export type ViewerOffersArgs = {
  filter: ViewerOffersFilter;
};

export type ViewerOffers = ActiveOffers | SubgraphWaitList;

export type ViewerOffersFilter = {
  pageId?: InputMaybe<Scalars['Int64']['input']>;
};

export type FetchServerHashesQueryVariables = Exact<{ [key: string]: never; }>;


export type FetchServerHashesQuery = { notePaths: Array<{ path: string, hash: string }> };

export type FetchNoteContentsQueryVariables = Exact<{
  filter?: InputMaybe<NotePathsFilter>;
}>;


export type FetchNoteContentsQuery = { notePaths: Array<{ content: string, path: string }> };

export type PushNotesMutationVariables = Exact<{
  input: PushNotesInput;
}>;


export type PushNotesMutation = { pushNotes:
    | { message: string }
    | { notes: Array<{ id: number, path: string, assets: Array<{ path: string, sha256Hash?: string | null, absolutePath: string, url: string }> }> }
   };

export type HideNotesMutationVariables = Exact<{
  input: HideNotesInput;
}>;


export type HideNotesMutation = { hideNotes:
    | { message: string }
    | { success: boolean }
   };

export type UploadNoteAssetMutationVariables = Exact<{
  input: UploadNoteAssetInput;
}>;


export type UploadNoteAssetMutation = { uploadNoteAsset:
    | { __typename: 'ErrorPayload', message: string }
    | { __typename: 'UploadNoteAssetPayload', uploadSkipped: boolean }
   };

export type CommitNotesMutationVariables = Exact<{ [key: string]: never; }>;


export type CommitNotesMutation = { commitNotes:
    | { success: boolean }
    | { message: string }
   };


export const FetchServerHashesDocument = gql`
    query FetchServerHashes {
  notePaths {
    path: value
    hash: latestContentHash
  }
}
    `;
export const FetchNoteContentsDocument = gql`
    query FetchNoteContents($filter: NotePathsFilter) {
  notePaths(filter: $filter) {
    path: value
    content
  }
}
    `;
export const PushNotesDocument = gql`
    mutation PushNotes($input: PushNotesInput!) {
  pushNotes(input: $input) {
    ... on ErrorPayload {
      message
    }
    ... on PushNotesPayload {
      notes {
        id
        path
        assets {
          path
          sha256Hash
          absolutePath
          url
        }
      }
    }
  }
}
    `;
export const HideNotesDocument = gql`
    mutation HideNotes($input: HideNotesInput!) {
  hideNotes(input: $input) {
    ... on HideNotesPayload {
      success
    }
    ... on ErrorPayload {
      message
    }
  }
}
    `;
export const UploadNoteAssetDocument = gql`
    mutation UploadNoteAsset($input: UploadNoteAssetInput!) {
  uploadNoteAsset(input: $input) {
    ... on ErrorPayload {
      __typename
      message
    }
    ... on UploadNoteAssetPayload {
      __typename
      uploadSkipped
    }
  }
}
    `;
export const CommitNotesDocument = gql`
    mutation CommitNotes {
  commitNotes {
    ... on CommitNotesPayload {
      success
    }
    ... on ErrorPayload {
      message
    }
  }
}
    `;

export type SdkFunctionWrapper = <T>(action: (requestHeaders?:Record<string, string>) => Promise<T>, operationName: string, operationType?: string, variables?: any) => Promise<T>;


const defaultWrapper: SdkFunctionWrapper = (action, _operationName, _operationType, _variables) => action();

export function getSdk(client: GraphQLClient, withWrapper: SdkFunctionWrapper = defaultWrapper) {
  return {
    FetchServerHashes(variables?: FetchServerHashesQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FetchServerHashesQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FetchServerHashesQuery>({ document: FetchServerHashesDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FetchServerHashes', 'query', variables);
    },
    FetchNoteContents(variables?: FetchNoteContentsQueryVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<FetchNoteContentsQuery> {
      return withWrapper((wrappedRequestHeaders) => client.request<FetchNoteContentsQuery>({ document: FetchNoteContentsDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'FetchNoteContents', 'query', variables);
    },
    PushNotes(variables: PushNotesMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<PushNotesMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<PushNotesMutation>({ document: PushNotesDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'PushNotes', 'mutation', variables);
    },
    HideNotes(variables: HideNotesMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<HideNotesMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<HideNotesMutation>({ document: HideNotesDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'HideNotes', 'mutation', variables);
    },
    UploadNoteAsset(variables: UploadNoteAssetMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<UploadNoteAssetMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<UploadNoteAssetMutation>({ document: UploadNoteAssetDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'UploadNoteAsset', 'mutation', variables);
    },
    CommitNotes(variables?: CommitNotesMutationVariables, requestHeaders?: GraphQLClientRequestHeaders, signal?: RequestInit['signal']): Promise<CommitNotesMutation> {
      return withWrapper((wrappedRequestHeaders) => client.request<CommitNotesMutation>({ document: CommitNotesDocument, variables, requestHeaders: { ...requestHeaders, ...wrappedRequestHeaders }, signal }), 'CommitNotes', 'mutation', variables);
    }
  };
}
export type Sdk = ReturnType<typeof getSdk>;