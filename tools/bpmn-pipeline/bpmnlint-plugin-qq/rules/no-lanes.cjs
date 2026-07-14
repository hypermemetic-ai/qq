'use strict';

module.exports = function noLanes() {
  return {
    check(node, reporter) {
      if (node.$type === 'bpmn:LaneSet' || node.$type === 'bpmn:Lane') {
        reporter.report(
          node.id,
          `Element type <${node.$type}> is outside the qq subset because auto-layout drops lanes`
        );
      }
    }
  };
};
