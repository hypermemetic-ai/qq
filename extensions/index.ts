// @ts-nocheck
// Sole global qq mount point. The bootstrap stays inert unless the current Git
// Repository explicitly carries qq.methodology=true in its common local config.

import registerQqMethodology from "./qq-methodology.ts";

export { QQ_EXTENSION_MODULES, inspectMethodologyLink } from "./qq-methodology.ts";
export default registerQqMethodology;
