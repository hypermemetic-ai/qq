'use strict';

module.exports = function noSubprocess() {
  return {
    check(node, reporter) {
      if (node.$instanceOf?.('bpmn:SubProcess')) {
        reporter.report(
          node.id,
          `Element type <${node.$type}> is outside the qq flat-process subset`
        );
      }
    }
  };
};
