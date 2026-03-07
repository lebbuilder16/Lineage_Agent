module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
    ],
    plugins: [
      "react-native-reanimated/plugin",
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@/components": "./src/components",
            "@/hooks": "./src/hooks",
            "@/lib": "./src/lib",
            "@/store": "./src/store",
            "@/theme": "./src/theme",
            "@/types": "./src/types",
            "@": "./",
          },
        },
      ],
    ],
  };
};
