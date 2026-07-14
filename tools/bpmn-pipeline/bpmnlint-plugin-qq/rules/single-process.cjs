'use strict';

module.exports = function singleProcess() {
  return {
    check(node, reporter) {
      if (node.$type !== 'bpmn:Definitions') {
        return;
      }

      const processes = (node.rootElements ?? [])
        .filter((element) => element.$instanceOf?.('bpmn:Process'));

      if (processes.length !== 1) {
        reporter.report(
          node.id,
          `Definitions must contain exactly one bpmn:Process; found ${processes.length}`
        );
      }
    }
  };
};
