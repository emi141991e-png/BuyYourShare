/**
 * BuyYourShare - Relational Database Schema & Audit Ledger Definitions
 */

export const SCHEMA_DEFINITIONS = {
  USERS: 'users',
  CONNECTED_ACCOUNTS: 'connected_accounts',
  SERVICES: 'services',
  GROUPS: 'groups',
  GROUP_ACCESS_INSTRUCTIONS: 'group_access_instructions',
  GROUP_MEMBERS: 'group_members',
  GROUP_CHATS: 'group_chats',
  CHAT_MESSAGES: 'chat_messages',
  NOTIFICATIONS: 'notifications',
  REPORTS: 'reports',
  FINANCIAL_AUDIT_LOGS: 'financial_audit_logs',
  PLATFORM_CONFIG: 'platform_config'
};

export const MEMBERSHIP_STATUS = {
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELLATION_SCHEDULED: 'CANCELLATION_SCHEDULED',
  EXPIRED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED'
};

export const GROUP_STATUS = {
  ACTIVE: 'active',
  FULL: 'full',
  CANCELLATION_SCHEDULED: 'cancellation_scheduled',
  TERMINATED: 'terminated'
};

export const CHAT_STATUS = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED'
};

export const MESSAGE_TYPE = {
  TEXT: 'TEXT',
  SYSTEM: 'SYSTEM',
  ACCESS_UPDATE: 'ACCESS_UPDATE',
  PAYMENT_NOTICE: 'PAYMENT_NOTICE'
};
