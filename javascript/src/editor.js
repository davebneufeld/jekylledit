/**
 *
 * @author petr.sloup@klokantech.com (Petr Sloup)
 *
 * Copyright 2016 Klokan Technologies Gmbh (www.klokantech.com)
 */
goog.provide('klokantech.jekylledit.Editor');

goog.require('goog.crypt.base64');
goog.require('goog.dom');
goog.require('goog.events');
goog.require('goog.events.EventType');
goog.require('klokantech.jekylledit.AbstractPage');
goog.require('klokantech.jekylledit.Auth');
goog.require('klokantech.jekylledit.utils');
goog.require('kt.MultiComplete');



/**
 * @param {klokantech.jekylledit.Auth} auth
 * @param {Object} config
 * @param {?string} category
 * @param {string} repo
 * @param {string=} opt_path
 * @param {Node=} opt_content
 * @param {Function=} opt_callback when ready
 * @constructor
 * @implements {klokantech.jekylledit.AbstractPage}
 */
klokantech.jekylledit.Editor = function(auth, config, category, repo,
                                        opt_path, opt_content, opt_callback) {
  /**
   * @type {klokantech.jekylledit.Auth}
   * @private
   */
  this.auth_ = auth;

  /**
   * @type {Object}
   * @private
   */
  this.config_ = config;

  /**
   * @type {?string}
   * @private
   */
  this.category_ = category;

  /**
   * @type {string}
   * @private
   */
  this.repo_ = repo;

  /**
   * @type {?string}
   * @private
   */
  this.path_ = opt_path || null;

  /**
   * @type {!Element}
   * @private
   */
  this.element_ = goog.dom.createDom(goog.dom.TagName.DIV, 'je-editor');

  /**
   * @type {!Element}
   * @private
   */
  this.content_ = goog.dom.createDom(goog.dom.TagName.DIV, 'je-editor-content');

  /**
   * @type {!Element}
   * @private
   */
  this.side_ = goog.dom.createDom(goog.dom.TagName.DIV, 'je-editor-side');

  goog.dom.append(this.element_, this.content_, this.side_);

  /**
   * @type {Object}
   * @private
   */
  this.editor_ = null;

  /**
   * @type {!Object.<string, boolean>}
   * @private
   */
  this.inlineFields_ = {};

  /**
   * @type {Node}
   * @private
   */
  this.editSource_ = opt_content || null;

  /**
   * @type {Object}
   * @private
   */
  this.postData_ = null;

  /**
   * @type {Object}
   * @private
   */
  this.postMeta_ = null;

  this.loadClear(opt_callback);
};


/**
 * @define {string} Selector to find editable fields.
 */
klokantech.jekylledit.Editor.EDITABLES_SELECTOR =
    '.je-editor [data-jekylledit-source]';


/**
 * @define {string} Default empty content.
 */
klokantech.jekylledit.Editor.DEFAULT_EMPTY_CONTENT =
    '<h1 data-jekylledit-source="title">Title</h1>' +
    '<div data-jekylledit-source="content">Content</div>';


/** @inheritDoc */
klokantech.jekylledit.Editor.prototype.getElement = function() {
  return this.element_;
};


/** @inheritDoc */
klokantech.jekylledit.Editor.prototype.loadClear = function(opt_callback) {
  if (this.path_) {
    this.auth_.sendRequest(
        'site/' + this.repo_ + '/' + goog.crypt.base64.encodeString(this.path_),
        goog.bind(function(e) {
          var xhr = e.target;
          var data = xhr.getResponseJson();
          this.postData_ = data;
          this.postMeta_ = this.postData_['metadata'];

          var cat =
          (this.postMeta_['category'] || this.postMeta_['categories']);
          if (goog.isArray(cat)) {
            this.category_ = null;
            goog.array.forEach(cat, function(cat_) {
              if (!this.category_ && this.config_['metadata'][cat_]) {
                this.category_ = cat_;
              }
            }, this);
            if (!this.category_) {
              this.category_ = cat[0];
            }
          } else {
            this.category_ = cat;
          }

          this.content_.innerHTML =
          (this.config_['metadata'][this.category_] || {})['empty_content'] ||
          klokantech.jekylledit.Editor.DEFAULT_EMPTY_CONTENT;

          if (opt_callback) {
            opt_callback();
          }
        }, this));
  } else {
    this.content_.innerHTML =
        (this.config_['metadata'][this.category_] || {})['empty_content'] ||
        klokantech.jekylledit.Editor.DEFAULT_EMPTY_CONTENT;
    this.postData_ = {
      'metadata': {},
      'content': ''
    };
    this.postMeta_ = {};
    if (opt_callback) {
      opt_callback();
    }
  }
};


/** @inheritDoc */
klokantech.jekylledit.Editor.prototype.start = function() {
  this.startEditor_();
  this.initSidebar_();
};


/**
 * @private
 */
klokantech.jekylledit.Editor.prototype.initSidebar_ = function() {
  goog.dom.removeChildren(this.side_);

  var fields = (this.config_['metadata'][this.category_] || {})['fields'] || {};

  goog.object.forEach(fields, function(el, k) {
    var label = goog.dom.createDom(goog.dom.TagName.LABEL, {}, k + ':');
    var inputValue = (this.postMeta_[k] || el['value']).toString();
    if (this.inlineFields_[k]) {
      var value = goog.dom.createDom(goog.dom.TagName.SPAN,
                                     'je-editor-editableinline', inputValue);
      goog.dom.append(this.side_, label, value);
    } else {
      goog.dom.appendChild(this.side_, label);
      el['_je_getval'] = this.createField_(el, this.postMeta_[k], this.side_);
    }
  }, this);

  goog.object.forEach(this.postMeta_, function(el, k) {
    if (!fields[k]) {
      var label = goog.dom.createDom(goog.dom.TagName.LABEL, {}, k + ':');
      var dataInput = goog.dom.createDom(goog.dom.TagName.DIV, {},
          this.postMeta_[k].toString());
      goog.dom.append(this.side_, label, dataInput);
    }
  }, this);
};


/**
 * @param {Object.<string, *>} field
 * @param {?*} currentValue
 * @param {Node} parent
 * @return {function(): *} Value getter
 * @private
 */
klokantech.jekylledit.Editor.prototype.createField_ =
    function(field, currentValue, parent) {
  var type = field['type'];
  var value = currentValue || field['value'];
  if (type == 'datetime') {
    var dataInput = goog.dom.createDom(goog.dom.TagName.INPUT, {
      type: 'datetime-local',
      value: value.split('-').slice(0, 3).join('-')
    });
    goog.dom.appendChild(parent, dataInput);
    return function() { return dataInput.value; };
  } else if (type == 'boolean') {
    var dataInput = goog.dom.createDom(goog.dom.TagName.INPUT, {
      type: 'checkbox',
      checked: value
    });
    goog.dom.appendChild(parent, dataInput);
    return function() { return dataInput.checked; };
  } else if (type == 'select') {
    var select = goog.dom.createDom(goog.dom.TagName.SELECT);
    goog.array.forEach(
        /** @type {Array} */(field['values']) || [], function(opt) {
          goog.dom.appendChild(select,
          goog.dom.createDom(goog.dom.TagName.OPTION, {
            value: opt
          }, opt));
        });
    select.value = value;
    goog.dom.appendChild(parent, select);
    return function() { return select.value; };
  } else if (type == 'multichoice') {
    var span = goog.dom.createDom(goog.dom.TagName.SPAN, 'je-multichoice');
    var mc = new kt.MultiComplete(
        span, /** @type {Array} */(field['values']) || [], undefined, true);
    goog.array.forEach(/** @type {Array} */(value) || [], function(opt) {
      mc.addValue(opt);
    });
    goog.dom.appendChild(parent, span);
    return function() { return mc.getValues(); };
  } else {
    var dataInput = goog.dom.createDom(goog.dom.TagName.INPUT, {
      type: 'text',
      value: value.toString()
    });
    goog.dom.appendChild(parent, dataInput);
    return function() { return dataInput.value; };
  }
};


/**
 * @private
 */
klokantech.jekylledit.Editor.prototype.startEditor_ = function() {
  var fields = (this.config_['metadata'][this.category_] || {})['fields'] || {};

  var editables = document.querySelectorAll(
      klokantech.jekylledit.Editor.EDITABLES_SELECTOR);
  goog.array.forEach(editables, function(editable) {
    var sourceType = editable.getAttribute('data-jekylledit-source');
    // wysiwyg for content, simple contentEditable for the rest
    if (sourceType == 'content') {
      klokantech.jekylledit.utils.installStyle(
          'https://cdnjs.cloudflare.com/ajax/libs/medium-editor/' +
          '5.16.1/css/medium-editor.min.css');
      klokantech.jekylledit.utils.installStyle(
          'https://cdnjs.cloudflare.com/ajax/libs/medium-editor/' +
          '5.16.1/css/themes/default.min.css');
      klokantech.jekylledit.utils.installScript(
          'https://cdnjs.cloudflare.com/ajax/libs/to-markdown/' +
          '3.0.0/to-markdown.min.js');
      klokantech.jekylledit.utils.installScript(
          'https://cdnjs.cloudflare.com/ajax/libs/showdown/' +
          '1.3.0/showdown.min.js', goog.bind(function() {
            var showdown = new goog.global['showdown']['Converter']();
            editable.innerHTML =
                showdown['makeHtml'](this.postData_['content']);
          }, this));
      klokantech.jekylledit.utils.installScript(
          'https://cdnjs.cloudflare.com/ajax/libs/medium-editor/' +
          '5.16.1/js/medium-editor.min.js', goog.bind(function() {
            if (this.editor_) {
              this.editor_['destroy']();
            }
            this.editor_ = new goog.global['MediumEditor'](
            '.je-editor [data-jekylledit-source="content"]',
            {
              'toolbar': {
                'buttons': [
                  'bold', 'italic', 'underline', 'orderedlist', 'unorderedlist',
                  'anchor', 'h2', 'h3', 'removeFormat'
                ]
              }
            });
          }, this));
    } else {
      var metaValue = this.postMeta_[sourceType];
      if (metaValue) {
        goog.dom.setTextContent(editable, metaValue);
      }
      var fieldDescription = fields[sourceType];
      if (fieldDescription) {
        editable.contentEditable = true;

        // HOOK to allow only simple text (no newlines, no pasting)
        goog.events.listen(editable, goog.events.EventType.INPUT, function(e) {
          if (goog.dom.getChildren(editable).length > 0) {
            var textContent = editable.textContent;
            editable.innerHTML = '';
            editable.textContent = textContent;
          }
        });
      } else {
        editable.removeAttribute('data-jekylledit-source');
      }
    }
    this.inlineFields_[sourceType] = true;
  }, this);
};


/** @inheritDoc */
klokantech.jekylledit.Editor.prototype.save = function(opt_callback) {
  var result = {
    'metadata': {}
  };

  var fields = (this.config_['metadata'][this.category_] || {})['fields'] || {};

  goog.object.forEach(fields, function(el, k) {
    var valueGetter = el['_je_getval'];
    if (valueGetter) {
      result['metadata'][k] = valueGetter();
    }
  }, this);

  var editables = document.querySelectorAll(
      klokantech.jekylledit.Editor.EDITABLES_SELECTOR);

  goog.array.forEach(editables, function(editable) {
    var sourceType = editable.getAttribute('data-jekylledit-source');
    if (sourceType == 'content') {
      result['content'] = goog.global['toMarkdown'](editable.innerHTML);
    } else {
      result['metadata'][sourceType] = editable.textContent;
    }
  }, this);
  if (this.editSource_) {
    klokantech.jekylledit.utils.cloneNodes(this.content_, this.editSource_);
  }

  var path = this.path_ ? goog.crypt.base64.encodeString(this.path_) : 'new';
  this.auth_.sendRequest('site/' + this.repo_ + '/' + path,
      goog.bind(function(e) {
        alert(this.path_ ? 'Changes saved!' : 'New post created !');
        if (opt_callback) {
          opt_callback();
        }
      }, this), this.path_ ? 'PUT' : 'POST', JSON.stringify(result), {
        'content-type': 'application/json'
      }
  );
};