'use strict'

/**
 * Utility functions for parsing and handling shortcodes in JavaScript.
 *
 * Lifted from the WordPress core:
 * https://github.com/WordPress/WordPress/blob/master/wp-includes/js/shortcode.js
 *
 */
var _            = require('lodash') // TODO: reduce this dep footprint
var asyncReplace = require('async-replace')

var Shortcode = {
  /**
   * Find the next matching shortcode
   *
   * Given a shortcode `tag`, a block of `text`, and an optional starting
   * `index`, returns the next matching shortcode or `undefined`.
   *
   * Shortcodes are formatted as an object that contains the match
   * `content`, the matching `index`, and the parsed `shortcode` object.
   *
   * @param tag
   * @param text
   * @param index
   * @return {*}
   */
  next: function (tag, text, index) {
    var re = Shortcode.regexp(tag)
    var match
    var result

    re.lastIndex = index || 0
    match = re.exec(text)

    if (!match) {
      return
    }

    // If we matched an escaped shortcode, try again.
    if (match[1] === '[' && match[7] === ']') {
      return Shortcode.next(tag, text, re.lastIndex)
    }

    result = {
      index: match.index,
      content: match[0],
      shortcode: Shortcode.fromMatch(match)
    }

    // If we matched a leading `[`, strip it from the match
    // and increment the index accordingly.
    if (match[1]) {
      result.content = result.content.slice(1)
      result.index++
    }

    // If we matched a trailing `]`, strip it from the match.
    if (match[7]) {
      result.content = result.content.slice(0, -1)
    }

    return result
  },

  /**
   * Replace matching shortcodes in a block of text
   *
   * Accepts a shortcode `tag`, content `text` to scan, and a `callback`
   * to process the shortcode matches and return a replacement string.
   * Returns the `text` with all shortcodes replaced.
   *
   * Shortcode matches are objects that contain the shortcode `tag`,
   * a shortcode `attrs` object, the `content` between shortcode tags,
   * and a boolean flag to indicate if the match was a `single` tag.
   *
   * @param tag
   * @param text
   * @param replacer
   * @param callback
   * @return {*|string}
   */
  replace: function (tag, text, replacer, callback) {
    return asyncReplace(text, Shortcode.regexp(tag), function (match, left, tag, attrs, slash, content, closing, right, offset, string, done) {
      // If both extra brackets exist, the shortcode has been
      // properly escaped.
      if (left === '[' && right === ']') {
        return match
      }

      // Create the match object and pass it through the replacer.
      var result = replacer(Shortcode.fromMatch(arguments), done)

      // Make sure to return any of the extra brackets if they
      // weren't used to escape the shortcode.
      result = result ? left + result + right : match

    }, callback)
  },

  /**
   * Generate a string from shortcode parameters
   *
   * Creates a `Shortcode` instance and returns a string.
   *
   * Accepts the same `options` as the `Shortcode()` constructor,
   * containing a `tag` string, a string or object of `attrs`, a boolean
   * indicating whether to format the shortcode using a `single` tag, and a
   * `content` string.
   *
   * @param options
   * @return {*}
   */
  string: function (options) {
    return new Shortcode(options).string()
  },

  /**
   * Generate a RegExp to identify a shortcode
   *
   * The base regex is functionally equivalent to the one found in
   * `get_shortcode_regex()` in `wp-includes/shortcodes.php`.
   *
   * Capture groups:
   * 1. An extra `[` to allow for escaping shortcodes with double `[[]]`
   * 2. The shortcode name
   * 3. The shortcode argument list
   * 4. The self closing `/`
   * 5. The content of a shortcode when it wraps some content.
   * 6. The closing tag.
   * 7. An extra `]` to allow for escaping shortcodes with double `[[]]`
   *
   * @param tag
   * @return {RegExp}
   */
  regexp: _.memoize(function (tag) {
    return new RegExp('\\[(\\[?)(' + tag + ')(?![\\w-])([^\\]\\/]*(?:\\/(?!\\])[^\\]\\/]*)*?)(?:(\\/)\\]|\\](?:([^\\[]*(?:\\[(?!\\/\\2\\])[^\\[]*)*)(\\[\\/\\2\\]))?)(\\]?)', 'g')
  }),

  /**
   * Parse shortcode attributes
   *
   * Shortcodes accept many types of attributes. These can chiefly be
   * divided into named and numeric attributes:
   *
   * Named attributes are assigned on a key/value basis, while numeric
   * attributes are treated as an array.
   *
   * Named attributes can be formatted as either `name="value"`,
   * `name='value'`, or `name=value`. Numeric attributes can be formatted
   * as `"value"` or just `value`.
   *
   * @param text
   * @return {{named: {}, numeric: Array}}
   */
  attrs: _.memoize(function (text) {
    var named = {}
    var numeric = []
    var pattern
    var match

    // This regular expression is reused from `shortcode_parse_atts()`
    // in `wp-includes/shortcodes.php`.
    //
    // Capture groups:
    //
    // 1. An attribute name, that corresponds to...
    // 2. a value in double quotes.
    // 3. An attribute name, that corresponds to...
    // 4. a value in single quotes.
    // 5. An attribute name, that corresponds to...
    // 6. an unquoted value.
    // 7. A numeric attribute in double quotes.
    // 8. An unquoted numeric attribute.
    pattern = /(\w+)\s*=\s*"([^"]*)"(?:\s|$)|(\w+)\s*=\s*\'([^\']*)\'(?:\s|$)|(\w+)\s*=\s*([^\s\'"]+)(?:\s|$)|"([^"]*)"(?:\s|$)|(\S+)(?:\s|$)/g

    // Map zero-width spaces to actual spaces.
    text = text.replace(/[\u00a0\u200b]/g, ' ')

    // Match and normalize attributes.
    while ((match = pattern.exec(text))) {
      if (match[1]) {
        named[match[1].toLowerCase()] = match[2]
      } else if (match[3]) {
        named[match[3].toLowerCase()] = match[4]
      } else if (match[5]) {
        named[match[5].toLowerCase()] = match[6]
      } else if (match[7]) {
        numeric.push(match[7])
      } else if (match[8]) {
        numeric.push(match[8])
      }
    }

    return {
      named: named,
      numeric: numeric
    }
  }),

  /**
   * Generate a Shortcode Object from a RegExp match
   *
   * Accepts a `match` object from calling `regexp.exec()` on a `RegExp`
   * generated by `Shortcode.regexp()`. `match` can also be set to the
   * `arguments` from a callback passed to `regexp.replace()`.
   *
   * @param match
   * @return {Shortcode}
   */
  fromMatch: function (match) {
    var type

    if (match[4]) {
      type = 'self-closing'
    } else if (match[6]) {
      type = 'closed'
    } else {
      type = 'single'
    }

    return new Shortcode({
      tag: match[2],
      attrs: match[3],
      type: type,
      content: match[5]
    })
  }
}

/**
 * Shortcode Objects
 *
 * Shortcode objects are generated automatically when using the main
 * `Shortcode` methods: `next()`, `replace()`, and `string()`.
 *
 * To access a raw representation of a shortcode, pass an `options` object,
 * containing a `tag` string, a string or object of `attrs`, a string
 * indicating the `type` of the shortcode ('single', 'self-closing', or
 * 'closed'), and a `content` string.
 *
 * @class Shortcode
 * @param options
 * @return {Shortcode}
 */
Shortcode = _.extend(function (options) {
  _.extend(this, _.pick(options || {}, 'tag', 'attrs', 'type', 'content'))

  var attrs = this.attrs

  // Ensure we have a correctly formatted `attrs` object.
  this.attrs = {
    named: {},
    numeric: []
  }

  if (!attrs) {
    return
  }

  // Parse a string of attributes.
  if (_.isString(attrs)) {
    this.attrs = Shortcode.attrs(attrs)

  // Identify a correctly formatted `attrs` object.
  } else if (_.isEqual(_.keys(attrs), ['named', 'numeric'])) {
    this.attrs = attrs

  // Handle a flat object of attributes.
  } else {
    _.each(options.attrs, function (value, key) {
      this.set(key, value)
    }, this)
  }
}, Shortcode)

_.extend(Shortcode.prototype, {
  /**
   * Get a shortcode attribute
   *
   * Automatically detects whether `attr` is named or numeric and routes
   * it accordingly.
   *
   * @param attr
   * @return {*}
   */
  get: function (attr) {
    return this.attrs[_.isNumber(attr) ? 'numeric' : 'named'][attr]
  },

  /**
   * Set a shortcode attribute
   *
   * Automatically detects whether `attr` is named or numeric and routes
   * it accordingly.
   *
   * @param attr
   * @param value
   * @return {Shortcode}
   */
  set: function (attr, value) {
    this.attrs[_.isNumber(attr) ? 'numeric' : 'named'][attr] = value
    return this
  },

  /**
   * Transform the shortcode match into a string
   *
   * @return {string}
   */
  string: function () {
    var text = '[' + this.tag

    _.each(this.attrs.numeric, function (value) {
      if (/\s/.test(value)) {
        text += ' "' + value + '"'
      } else {
        text += ' ' + value
      }
    })

    _.each(this.attrs.named, function (value, name) {
      text += ' ' + name + '="' + value + '"'
    })

    // If the tag is marked as `single` or `self-closing`, close the
    // tag and ignore any additional content.
    if (this.type === 'single') {
      return text + ']'
    } else if (this.type === 'self-closing') {
      return text + ' /]'
    }

    // Complete the opening tag.
    text += ']'

    if (this.content) {
      text += this.content
    }

    // Add the closing tag.
    return text + '[/' + this.tag + ']'
  }
})
module.exports = Shortcode