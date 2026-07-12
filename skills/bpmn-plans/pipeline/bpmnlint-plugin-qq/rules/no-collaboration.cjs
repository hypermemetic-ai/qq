'use strict';

const forbiddenTypes = new Set([
  'bpmn:Collaboration',
  'bpmn:Participant',
  'bpmn:MessageFlow'
]);

module.exports = function noCollaboration() {
  return {
    check(node, reporter) {
      if (forbiddenTypes.has(node.$type)) {
        reporter.report(
          node.id,
          `Element type <${node.$type}> is outside the qq single-process subset`
        );
      }
    }
  };
};
