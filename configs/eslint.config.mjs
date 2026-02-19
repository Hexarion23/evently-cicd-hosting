import globals from "globals";
import pluginJs from "@eslint/js";

export default [
  pluginJs.configs.recommended,

  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        supabase: "readonly",
        bootstrap: "readonly",
        Chart: "readonly",
        Html5Qrcode: "readonly",
        showToast: "readonly",
        formatDate: "readonly",
        currentEvent: "readonly",
        currentEventId: "readonly",
        refreshWaitlistUI: "readonly",
        notifyExcoEventCreated: "readonly",
        notifyExcoEventEdited: "readonly",
        notifyUserAttendanceMarked: "readonly",
        logout: "readonly",
        eventId: "readonly",
      },
    },
    rules: {
      // Logic & Formatting (Warnings won't stop the build)
      "no-template-curly-in-string": "error",
      "no-unused-vars": "warn",
      "no-undef": "warn",
      "prefer-template": "warn",
      "max-depth": "warn",
      camelcase: "off",
      "prefer-const": "warn",
      "sort-imports": "warn",
      "max-nested-callbacks": ["warn", { max: 4 }],
      "prefer-arrow-callback": "warn",
      "no-loop-func": "warn",

      // THE FIX FOR DB.JS: Ignore the missing TypeScript rule error
      "@typescript-eslint/no-var-requires": "off",
    },
  },
];
