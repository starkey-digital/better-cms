import { createCmsClient } from "better-cms/sveltekit";
import type { Cms } from "./server/cms";

export const cmsClient = createCmsClient<Cms>({
  basePath: "/api/cms",
});
