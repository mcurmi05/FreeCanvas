import {
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

//generate every pwa icon size from one source svg
//source artwork should be a real designer icon, see public/logo.svg
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/logo.svg'],
})
