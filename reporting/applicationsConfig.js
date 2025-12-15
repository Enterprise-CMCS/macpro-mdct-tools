export const getApplicationsConfig = (environment) => ({
  mcr: {
    name: "MCR",
    reportTypes: [
      {
        type: "mcpar",
        tableName: `${environment}-mcpar-reports`,
        bucketName: `database-${environment}-mcpar`,
        dateField: "submittedOnDate",
        statusField: "status",
        statusValue: "Submitted",
      },
      {
        type: "mlr",
        tableName: `${environment}-mlr-reports`,
        bucketName: `database-${environment}-mlr`,
        dateField: "submittedOnDate",
        statusField: "status",
        statusValue: "Submitted",
      },
      {
        type: "naaar",
        tableName: `${environment}-naaar-reports`,
        bucketName: `database-${environment}-naaar`,
        dateField: "submittedOnDate",
        statusField: "status",
        statusValue: "Submitted",
      },
    ],
  },
  mfp: {
    name: "MFP",
    reportTypes: [
      {
        type: "sar",
        tableName: `${environment}-sar-reports`,
        bucketName: `database-${environment}-sar`,
        dateField: "submittedOnDate",
        statusField: "status",
        statusValue: "Submitted",
      },
      {
        type: "wp",
        tableName: `${environment}-wp-reports`,
        bucketName: `database-${environment}-wp`,
        dateField: "submittedOnDate",
        statusField: "status",
        statusValue: "Submitted",
      },
      {
        type: "abcd",
        tableName: `${environment}-abcd-reports`,
        bucketName: `database-${environment}-abcd`,
        dateField: "submittedOnDate",
        statusField: "status",
        statusValue: "Submitted",
      },
    ],
  },
  hcbs: {
    name: "HCBS",
    reportTypes: [
      {
        type: "qms",
        tableName: `${environment}-qms-reports`,
        dateField: "submitted",
        statusField: "status",
        statusValue: "Submitted",
      },
      {
        type: "tacm",
        tableName: `${environment}-tacm-reports`,
        dateField: "submitted",
        statusField: "status",
        statusValue: "Submitted",
      },
      {
        type: "ci",
        tableName: `${environment}-ci-reports`,
        dateField: "submitted",
        statusField: "status",
        statusValue: "Submitted",
      },
      {
        type: "pcp",
        tableName: `${environment}-pcp-reports`,
        dateField: "submitted",
        statusField: "status",
        statusValue: "Submitted",
      },
    ],
  },
  carts: {
    name: "CARTS",
    // State certifications tracked by lastChanged timestamp
    // Note: Username stored in DDB, email requires Cognito lookup
    queryType: "stateStatus",
    reportTypes: [
      {
        type: "state-status",
        tableName: `${environment}-state-status`,
        dateField: "lastChanged",
        statusField: "status",
        statusValue: "certified",
      },
    ],
  },
  seds: {
    name: "SEDS",
    // Forms track provisional (2) and final (3) certifications via status_date
    queryType: "forms",
    needsUserLookup: true,
    reportTypes: [
      {
        type: "state-forms",
        tableName: `${environment}-state-forms`,
        dateField: "status_date",
        statusField: "status_id",
        statusValue: [2, 3],
      }, // 2=Provisional, 3=Final
    ],
  },
  qmr: {
    name: "QMR",
    // Core sets use boolean submitted flag with lastAltered timestamp
    // Note: Username stored in DDB, email requires Cognito lookup
    queryType: "coreSets",
    reportTypes: [
      {
        type: "core-sets",
        tableName: `${environment}-coreSet`,
        dateField: "lastAltered",
        statusField: "submitted",
        statusValue: true,
      },
    ],
  },
});
