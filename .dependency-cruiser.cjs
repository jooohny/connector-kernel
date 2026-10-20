module.exports = {
  forbidden: [
    {
      name: 'payments-domain-is-pure',
      severity: 'error',
      from: { path: '^src/modules/payments/domain/' },
      to: { pathNot: '^src/modules/payments/domain/' },
    },
    {
      name: 'payments-application-not-outward',
      severity: 'error',
      from: { path: '^src/modules/payments/application-services/' },
      to: { path: '^src/modules/payments/(infrastructure|ui)/' },
    },
    {
      name: 'payments-ui-not-infrastructure',
      severity: 'error',
      from: { path: '^src/modules/payments/ui/' },
      to: { path: '^src/modules/payments/infrastructure/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: { path: '^src/' },
      to: { circular: true, path: '^src/' },
    },
  ],
  options: {
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: '^tests/',
  },
};
