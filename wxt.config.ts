import { defineConfig } from "wxt";

export default defineConfig({
  manifestVersion: 3,
  targetBrowsers: ["chrome", "edge", "firefox", "safari"],
  manifest: ({ browser }) => ({
    name: "__MSG_manifest_name__",
    description: "__MSG_manifest_description__",
    version: "3.0.0",
    default_locale: "en",
    homepage_url: "https://github.com/jonluca/Never-Ending-Netflix",
    permissions: ["storage"],
    action: {
      default_title: "__MSG_manifest_name__",
      default_icon: {
        32: "images/icon32.png",
        64: "images/icon64.png",
        128: "images/icon128.png"
      }
    },
    icons: {
      32: "images/icon32.png",
      64: "images/icon64.png",
      128: "images/icon128.png"
    },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "never-ending-netflix@jonlu.ca",
              strict_min_version: "140.0",
              data_collection_permissions: { required: ["none"] }
            },
            gecko_android: {
              strict_min_version: "142.0"
            }
          }
        }
      : {})
  })
});
