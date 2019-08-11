var Syntax = require('esprima').Syntax;
var jstransform = require('jstransform');
// var through = require('through');
var utils = require('jstransform/src/utils');

var reserved = [
    "break", "case", "catch", "continue", "default", "delete", "do", "else",
    "finally", "for", "function", "if", "in", "instanceof", "new", "return",
    "switch", "this", "throw", "try", "typeof", "var", "void", "while", "with",
    "abstract", "boolean", "byte", "char", "class", "const", "debugger",
    "double", "enum", "export", "extends", "final", "float", "goto",
    "implements", "import", "int", "interface", "long", "native", "package",
    "private", "protected", "public", "short", "static", "super",
    "synchronized", "throws", "transient", "volatile", "null"
];
var reservedDict = {};
reserved.forEach(function (k) {
    reservedDict[k] = true;
});

var es6ObjectConciseMethods = require('jstransform/visitors/es6-object-concise-method-visitors');
var es7SpreadProperties = require('jstransform/visitors/es7-spread-property-visitors');

var Syntax = require('esprima-fb').Syntax;
var utils = require('jstransform/src/utils');

function process(traverse, node, path, state) {
    utils.catchupWhiteSpace(node.range[0], state);
    traverse(node, path, state);
    utils.catchup(node.range[1], state);
}

/**
 * Note: This visitor is capable of handling the following transforms too:
 * - ES7 object literal spread,
 * - ES6 object concise methods,
 * - ES6 object short notation,
 * This is because of limitations in the jstransform framework, which isn't
 * capable of feeding the output of one visitor to another. Additionally,
 * any attempt to share logic between these visitors only increases code
 * complixity. And so, we are forced to create a single complex one that
 * handles all cases.
 *
 * {alpha: 12, \'beta\': 34, ['gam' + 'ma']: 56} // before
 * (_={},_.alpha=12,_['beta']=34,_['gam' + 'ma']=56,_) // after
 */
function es6ObjectComputedProperties(traverse, node, path, state) {
    var obj = utils.injectTempVar(state);
    utils.append('(' + obj + '={}', state);
    for (var ii = 0; ii < node.properties.length; ++ii) {
        var property = node.properties[ii];
        utils.append(',', state);

        if (property.type === Syntax.SpreadProperty) {
            utils.append('Object.assign(' + obj, state);
            var nextComputedPropertyIndex = ii + 1;
            while (
                nextComputedPropertyIndex < node.properties.length &&
                !node.properties[nextComputedPropertyIndex].computed
            ) {
                nextComputedPropertyIndex += 1;
            }
            utils.catchupWhiteSpace(node.properties[ii].range[0], state);
            var lastWasSpread = es7SpreadProperties.renderSpreadProperties(
                traverse,
                node.properties.slice(ii, nextComputedPropertyIndex),
                path,
                state,
                true // previousWasSpread
            );
            utils.append((lastWasSpread ? '' : '}') + ')', state);
            ii = nextComputedPropertyIndex - 1;
            continue;

            // short notation / dot access
        } else if (
            property.type === Syntax.Property &&
            property.key.type === Syntax.Identifier &&
            !property.computed
        ) {
            utils.append(obj + '.' + property.key.name + '=', state);

            // literals / computed properties
        } else if (property.type === Syntax.Property) {
            utils.append(obj + '[', state);
            process(traverse, property.key, path, state);
            utils.append(']=', state);
        }

        // concise methods
        if (property.method === true) {
            utils.catchupWhiteSpace(property.key.range[1], state);
            es6ObjectConciseMethods.renderConciseMethod(traverse, property, path, state);
        }
        process(traverse, property.value, path, state);
    }
    utils.catchupWhiteSpace(node.range[1], state);
    utils.append(',' + obj + ')', state);
    return false;
}
es6ObjectComputedProperties.test = function (node, path, state) {
    if (node.type !== Syntax.ObjectExpression) {
        return false;
    }
    for (var ii = 0; ii < node.properties.length; ++ii) {
        if (reservedDict[node.properties[ii].key.name]) {
            return true;
        }
    }
    return false;
};

var visitorList = [
    es6ObjectComputedProperties
];

function transform(code) {
    return jstransform.transform(visitorList, code).code;
}

module.exports = process;
module.exports.isReserved = function (word) {
    return reservedDict.hasOwnProperty(word) ? !!reservedDict[word] : false;
};
module.exports.transform = transform;
module.exports.visitorList = visitorList;
