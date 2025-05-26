// Feature flag — set to true to re-enable the subscription UI surface
export const SUBSCRIPTION_UI_ENABLED = false;

export const IMPORT_UI_STATE = Object.freeze({
  IDLE:     'idle',
  SCANNING: 'scanning',
});

export const UI_TEXT = Object.freeze({
  NO_DATA_FOUND:  'No data found.',
  CANCEL_SCAN:    'Cancel scan',
  START_SCAN:     'Start scan',
});

export const CSS_CLASS = Object.freeze({
  POPPED_OUT:  'popped-out',
  HIDDEN:      'hidden',
  BTN_CANCEL:  'btn-cancel',
  MUTED:       'muted',
  MT_HALF:     'mt-0-5',
  COL:         'col',
  COL_NAME:       'name',
  COL_CONFIDENCE: 'confidence',
  COL_LAST_EMAIL: 'last-email',
  COL_DIFF:    'difficulty',
  COL_ACTION:  'action',
  BADGE:       'badge',
  BADGE_HIGH:  'badge-high',
  BADGE_MED:   'badge-medium',
  BADGE_LOW:   'badge-low',
  BADGE_SUB_ACTIVE:    'badge-sub-active',
  BADGE_SUB_CANCELLED: 'badge-sub-cancelled',
  BADGE_SUB_TRIAL:     'badge-sub-trial',
  FILTER_BTN:  'filter-btn',
  FILTER_BTN_ACTIVE: 'active',
});

export const DOM_ID = Object.freeze({
  MBOX_FILE_INPUT:    'mboxFileInput',
  SELECTED_FILE_INFO: 'selectedFileInfo',
  START_SCAN_BTN:     'startScanBtn',
  IMPORT_PROGRESS:    'importProgress',
  IMPORT_PROGRESS_BAR:'importProgressBar',
  DOWNLOAD_ACCOUNTS:  'downloadAccounts',
  ACCOUNT_LIST:       'accountList',
  ACCOUNT_COUNT:      'accountCount',
  POP_OUT_BTN:        'popOutBtn',
  INSTRUCTIONS_TEXT:  'instructionsText',
  LARGE_FILE_WARNING: 'largeFileWarning',
  SORT_SELECT:        'sortSelect',
  CONFIDENCE_FILTER:  'confidenceFilter',
  SHOW_SUBSCRIPTIONS: 'showSubscriptions',
});
