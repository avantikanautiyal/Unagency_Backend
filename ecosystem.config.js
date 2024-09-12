module.exports = {
  apps: [
    {
      name: "bun-app",
      script: "index.ts",
      interpreter: "bun",
      env: {
        PORT: process.env.PORT,
        TOKEN: process.env.TOKEN,
        apiKey: process.env.apiKey,
        authDomain: process.env.authDomain,
        projectId: process.env.projectId,
        storageBucket: process.env.storageBucket,
        messagingSenderId: process.env.messagingSenderId,
        appId: process.env.appId,
        measurementId: process.env.measurementId,
        DB_URI: process.env.DB_URI,
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        AWS_REGION: process.env.AWS_REGION,
        stripe_access_key: process.env.stripe_access_key,
        stripe_secret_key: process.env.stripe_secret_key,
        stripe_webhook_endpoint_secret:
          process.env.stripe_webhook_endpoint_secret,
      },
    },
  ],
};
