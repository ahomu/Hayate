/**
 * Hayate.js
 * ♪はやてのように〜　♪ざぶんぐる〜　♪ざぶんぐる〜
 *
 * Copyright (c) 2011 Ayumu Sato ( http://havelog.ayumusato.com )
 *
 * Licensed under the MIT license:
 *  http://www.opensource.org/licenses/mit-license.php
 *
 * きっとたぶんSupport条件
 *  HTML文書オンリー
 *  一部のpseudo(*-of-typeとかlink, dynamic擬似クラス)に非対応
 *
 * 精度面の制限
 *  attribute -> 属性値に [ : , などの記号類が含まれると動作しない
 *  pseudo    -> nth-child( 2n + 1 ) のように不要な空白を入れると動作しない
 */
(function(win, doc, loc, nav) {

    "use strict";

    win.Hayate = query;

    // ua detect
    /MSIE (\d+)/.test(nav.userAgent);

    var qSA         = !!doc.querySelectorAll,
        ieVer       = parseFloat(RegExp.$1),
        ieOld       = !!ieVer && ieVer <  9,
        ie8         = !!ieVer && ieVer == 8,
        toArray     = !!ieOld ? toArrayCopy : toArraySlice,
        toString    = Object.prototype.toString,
        mergeArray  = Array.prototype.push,

        TYPEOF_ARRAY = '[object Array]',
        IE_FIX_ATTR  = {
            'class'     : 'className',
            'for'       : 'htmlFor',
            acesskey    : 'accessKey',
            tabindex    : 'tabIndex',
            colspan     : 'colSpan',
            rowspan     : 'rowSpan',
            frameborder : 'frameBorder'
        },

        INDEXED_STORE = {},
        INDEXED_COUNT = 0,

        ELEMENT_UID  = 0,
        COMBINATE_ID = 0,

        COMBINATOR_CHILD           = 1,
        COMBINATOR_SIBLING         = 2,
        COMBINATOR_GENERAL_SIBLING = 3,

        PSEUDO_UNDEFINED  = 0,

        PSEUDO_NTHCHILD   = 1, PSEUDO_FLCHILD    = 2, PSEUDO_NTHTYPE    = 3,
        PSEUDO_FLTYPE     = 4, PSEUDO_ONLYTYPE   = 5,

        PSEUDO_UISTATE    = 1, PSEUDO_NOT        = 2, PSEUDO_FOCUS      = 3,
        PSEUDO_ROOT       = 4, PSEUDO_EMPTY      = 5, PSEUDO_TARGET     = 6,
        PSEUDO_LANG       = 7, PSEUDO_CONTAINS   = 8,

        ATTRIBUTE_EQUAL   = 1, ATTRIBUTE_END     = 2, ATTRIBUTE_START   = 3,
        ATTRIBUTE_CONTAIN = 4, ATTRIBUTE_PART    = 5, ATTRIBUTE_NOT     = 6,
        ATTRIBUTE_HAS     = 7
    ;

    var EVALUATE_PSEUDO = {
            'only-child'       : PSEUDO_NTHCHILD,
            'nth-child'        : PSEUDO_NTHCHILD,
            'nth-last-child'   : PSEUDO_NTHCHILD,
            'first-child'      : PSEUDO_FLCHILD,
            'last-child'       : PSEUDO_FLCHILD,
            'nth-of-type'      : PSEUDO_NTHTYPE,
            'nth-last-of-type' : PSEUDO_NTHTYPE,
            'first-of-type'    : PSEUDO_FLTYPE,
            'last-of-type'     : PSEUDO_FLTYPE,
            'only-of-type'     : PSEUDO_ONLYTYPE,

            'enabled'          : PSEUDO_UISTATE,
            'disabled'         : PSEUDO_UISTATE,
            'checked'          : PSEUDO_UISTATE,
            'not'              : PSEUDO_NOT,
            'focus'            : PSEUDO_FOCUS,
            'contains'         : PSEUDO_CONTAINS,
            'root'             : PSEUDO_ROOT,
            'empty'            : PSEUDO_EMPTY,
            'target'           : PSEUDO_TARGET,
            'lang'             : PSEUDO_LANG,

            'link'             : PSEUDO_UNDEFINED, // リンク擬似クラス: 保留
            'visited'          : PSEUDO_UNDEFINED, // リンク擬似クラス: 同上
            'hover'            : PSEUDO_UNDEFINED, // ダイナミック擬似クラス: 同上
            'active'           : PSEUDO_UNDEFINED, // ダイナミック擬似クラス: 同上(:active はクリックしている要素の先祖も対象？)
            'selected'         : PSEUDO_UNDEFINED, // ありそうでない妄想クラス
            'indeterminate'    : PSEUDO_UNDEFINED  // いつかきっとそのうち
        },
        EVALUATE_ATTRIBUTE = {
            '='  : ATTRIBUTE_EQUAL,
            '$=' : ATTRIBUTE_END,
            '^=' : ATTRIBUTE_START,
            '*=' : ATTRIBUTE_CONTAIN,
            '~=' : ATTRIBUTE_PART,
            '|=' : ATTRIBUTE_EQUAL,
            '!=' : ATTRIBUTE_NOT,
            ''   : ATTRIBUTE_HAS
        },
        EVALUATE_COMBINATOR = {
            '>' : COMBINATOR_CHILD,
            '+' : COMBINATOR_SIBLING,
            '~' : COMBINATOR_GENERAL_SIBLING
        }
    ;

    /**
     * NodeList, HTMLCollectionを，Arrayに変換
     *
     * @param {Object} list
     */
    function toArrayCopy(list) {
        var rv= new Array(list.length), i = list.length;
        for (; i-->0;)
            if (i in list) {
                rv[i]= list[i];
            }
        return rv;
    }

    /**
     * NodeList, HTMLCollectionを，Arrayに変換
     *
     * @param {Object} list
     */
    function toArraySlice(list) {
        return Array.prototype.slice.call(list);
    }

    /**
     * 属性値を取得する
     *
     * @param {Node} elm
     * @param {String} key
     * @return {String}
     */
    function getAttr(elm, key) {
        if (!!ieOld && key in IE_FIX_ATTR) {
            key = IE_FIX_ATTR[key];
        }
        return elm.getAttribute(key);
    }

    /**
     * クエリーセレクタ
     *
     * @param {String} expr
     * @param {Node|Document|Array} root
     * @return {Array}
     */
    function query(expr, root) {
        var exprStack, i,
            RE_CONCISE = /^([a-z0-6]*)([.#]?)([\w\-_]*)$/,
            matches, rv,
            unknownToken, ie8pseudo;

        root = root || doc;

        // 短絡評価が可能なら済ませる
        if (matches = RE_CONCISE.exec(expr)) {
            // matches[1] tagName
            //        [2] by
            //        [3] specifier
            return _concise(matches[1] || '*', root, matches[3], matches[2]);
        }

        // [attr!="val"]と:containsは，qSAに食わせると例外
        unknownToken = (/:contains|!=/.test(expr));

        // IE8は:not, :nth-*, :last-*, :only-* に対応しない
        ie8pseudo = (ie8 && /!=|:not|:nth|:last|:only/.test(expr));

        // @todo issue: Arrayのrootを受け取れるようにする

        if (qSA && !unknownToken && !ie8pseudo) {
            // 通常のquerySelectorAllを使用
            rv = toArray(root.querySelectorAll(expr));
        } else {
            if (expr.indexOf(',') === -1) {
                rv = _selector(expr, root);
            } else {
                exprStack = expr.split(',');

                rv = [];
                i  = 0;
                while (expr = exprStack[i++]) {
                    mergeArray.apply(rv, _selector(expr, root));
                }
            }
            // 要素のインデックスを初期化
            INDEXED_STORE = {};
            INDEXED_COUNT = 0;
        }
        return rv;
    }

    /**
     * querySelectorAllの代替
     *
     * @param {String} expr
     * @param {Node|Document} root
     * @return {Array}
     */
    function _selector(expr, root) {
        var tokenGroup, token, i = 0,
            filterGroup, filter, fi,
            combinator, tagName, traversal, specifier,
            RE_DETECT_COMBINATOR = /^([>+~])/,
            RE_DETECT_TAGNAME    = /^([a-z0-6*]+)[#.[:]?/,
            RE_DETECT_SPECIFIER  = /^([#.])([a-zA-Z0-9-_]+)/,
            RE_PARSE_ATTRIBUTE   = /^\[(.+?)([~^$*|!>]?=)(.+)\]$/,
            RE_PARSE_PSEUDO      = /^:([a-z-]+)\(?([a-z-+\d.#>+~]*)\)?$/,
            matches,
            rv;

        // IDがあればそれ以前を切り取る
        if (expr.indexOf('#')) {
            expr = expr.replace(/^.*?([a-z0-9*]*#.+)$/, '$1');
        }

        // 生のセレクタ文字列を加工
        // @todo issue: pseudoやattributeの精度を高めるなら，ここの加工を濃くする
        expr = expr
            // トリム
            .replace(/^\s+/, '').replace(/\s+$/, '')
            // 2つ以上のスペースを1つに変換
            .replace(/\s{2,}/g, ' ')
            // クオーテーションを除去
            .replace(/['"]/g, '')
            // combinatorの左脇にのみスペース
            .replace(/\s?>\s?/g, ' >')
            .replace(/\s?~\s?([^=])/g, ' ~$1')    // [attr~="\w"]でない
            .replace(/\s?\+\s?([^\d])/g, ' +$1')  // :pusedo(n+\d)でない
        ;

        // 評価変数を初期化
        rv = [root];

        // セレクタを評価単位に分割
        tokenGroup = expr.split(' ');

        while (token = tokenGroup[i++]) {
            // default
            combinator = '';
            tagName    = '*';
            traversal  = _tag;
            specifier  = '';

            // combinator
            if (RE_DETECT_COMBINATOR.test(token)) {
                combinator = RegExp.$1;
                token      = token.substr(1);
            }

            // tagName
            if (RE_DETECT_TAGNAME.test(token)) {
                tagName = RegExp.$1;
                token   = token.substr(tagName.length);
            }

            // specifier
            if (RE_DETECT_SPECIFIER.test(token)) {
                traversal = RegExp.$1 === '#' ? _ident : _class;
                specifier = RegExp.$2;
                token     = token.substr(specifier.length+1);
            }

            // traversal
            if (!!combinator) {
                rv = _combinator(combinator, traversal, tagName, rv, specifier);
            } else {
                rv = traversal(tagName, rv, specifier);
            }

            rv = _uniqueness(rv);

            // filter (pseudo & attribute)
            if (!!token) {
                filterGroup = token.replace(/([[:])/g, ' $1').substr(1).split(' ');
                fi = 0;
                while (filter = filterGroup[fi++]) {
                    switch(filter.charAt(0)) {
                        case '[':
                            // attribute
                            if (matches = RE_PARSE_ATTRIBUTE.exec(filter)) {
                                // matches[1] attribute
                                //        [2] operator
                                //        [3] criterion
                                rv = _attribute(rv, matches[2], matches[1], matches[3]);
                            } else {
                                rv = _attribute(rv, '', filter.slice(1, -1), '');
                            }
                        break;
                        case ':':
                            // pseudos
                            if (matches = RE_PARSE_PSEUDO.exec(filter)) {
                                // matches[1] pseudo
                                //        [2] argutment
                                rv = _pseudos(rv, matches[1], matches[2]);
                            }
                        break;
                    }
                }
            }
        }
        return rv;
    }

    /**
     * 短絡評価
     * 簡潔なセレクタをより速く評価する
     *
     * @param {String} tagName
     * @param {Node|Document|Array} roots
     * @param {String} specifier
     * @param {String} by
     * @return {Array}
     */
    function _concise(tagName, roots, specifier, by) {
        var rv = [];

        if (toString.call(roots) !== TYPEOF_ARRAY) {
            roots = [roots];
        }

        switch(by) {
            case '#':
                rv = _ident(tagName, roots, specifier);
            break;
            case '.':
                rv = _class(tagName, roots, specifier);
            break;
            default:
                rv = _tag(tagName, roots);
            break;
        }
        return rv;
    }

    /**
     * IDセレクタ
     *
     * @param {String} tagName
     * @param {Array} roots
     * @param {String} ident
     * @return {Array}
     */
    function _ident(tagName, roots, ident) {
        var rv;

        tagName = tagName.toUpperCase();
        // documentは先頭要素からサンプリングする
        roots   = roots[0].nodeType >= 9 ? roots[0] : roots[0].ownerDocument;

        rv = roots.getElementById(ident);

        if (rv && tagName === '*' || rv && rv.tagName === tagName) {
            return [rv];
        } else {
            return []
        }
    }

    /**
     * クラスセレクタ
     *
     * @param {String} tagName
     * @param {Array} roots
     * @param {String} clazz
     * @return {Array}
     */
    function _class(tagName, roots, clazz) {
        var rv = [], i = 0, root, tmp, p = 0,
            e, j = 0;

        tagName  = tagName.toUpperCase();

        while (root = roots[i++] ) {
            if (!root.getElementsByClassName) {
                var elms    = root.getElementsByTagName(tagName),
                    evClass = ' '+clazz+' ';

                while (e = elms[j++]) {
                    if ((' '+e.className+' ').indexOf(evClass) !== -1) {
                        rv[p++] = e;
                    }
                }
            } else {
                tmp = toArray(root.getElementsByClassName(clazz));
                if (tagName !== '*') {
                    while (e = tmp[j++]) {
                        if (e.tagName === tagName) {
                            rv[p++] = e;
                        }
                    }
                } else {
                    mergeArray.apply(rv, tmp);
                }
            }
        }
        return rv;
    }

    /**
     * タグセレクタ
     *
     * @param {String} tagName
     * @param {Array} roots
     * @return {Array}
     */
    function _tag(tagName, roots) {
        var rv = [], i = 0, root;

        while (root = roots[i++]) {
            mergeArray.apply(rv, toArray(root.getElementsByTagName(tagName)));
        }

        return rv;
    }

    /**
     * 子・隣接・間接セレクタ
     *
     * @param {Array} elms
     * @param {String} comb
     */
    function _combinator(comb, traversal, tagName, elms, specifier) {
        var rv = [], evals = [], e,
            i = 0, // 前処理
            j = 0, // 後処理
            p = 0,
            cid, pe, uid, done = {};

        cid = ++COMBINATE_ID;

        switch (EVALUATE_COMBINATOR[comb]) {
            case COMBINATOR_CHILD:
                // 親要素候補に一律でcidを付与
                while (e = elms[i++]) {
                    e.cardinalId = cid;
                }

                // 探索
                elms = traversal(tagName, elms, specifier);

                // 直接の親のcidが一致する要素のみreturn
                while (e = elms[j++]) {
                    if (e.parentNode.cardinalId === cid) {
                        rv[p++] = e;
                    }
                }
            break;
            case COMBINATOR_SIBLING:
                while (e = elms[i++]) {
                    // 探索次元を親要素に繰り上げ
                    pe  = e.parentNode;
                    uid = pe.uniqueId || (pe.uniqueId = ++ELEMENT_UID);
                    if (!done[uid]) {
                        done[uid] = true;
                        evals.push(pe);
                    }
                    // 隣接要素にcidを付与
                    while (e = e.nextSibling) {
                        if (e.nodeType === 1) {
                            e.cardinalId = cid;
                            break;
                        }
                    }
                }
                // 評価用要素で探索
                elms = traversal(tagName, evals, specifier);

                // cidが一致する要素のみreturn
                while (e = elms[j++]) {
                    if (e.cardinalId && e.cardinalId === cid) {
                        rv[p++] = e;
                    }
                }
            break;
            case COMBINATOR_GENERAL_SIBLING:
                while (e = elms[i++]) {
                    // 探索次元を親要素に繰り上げ
                    pe  = e.parentNode;
                    uid = pe.uniqueId || (pe.uniqueId = ++ELEMENT_UID);
                    if (!done[uid]) {
                        done[uid] = true;
                        evals.push(pe);
                    }
                    // 間接要素にcidを付与
                    while (e = e.nextSibling) {
                        if (e.nodeType === 1) {
                            // cidが未定義 or 今巡のcidと異なるときのみ付与
                            if (!e.cardinalId || e.cardinalId !== cid) {
                                e.cardinalId = cid;
                            } else {
                                break;
                            }
                        }
                    }
                }

                // 評価用要素で探索
                elms = traversal(tagName, evals, specifier);

                // cidが一致する要素のみreturn
                while (e = elms[j++]) {
                    if (e.cardinalId && e.cardinalId === cid) {
                        rv[p++] = e;
                    }
                }
            break;
        }
        return rv;
    }

    /**
     * 返却要素群のユニーク化
     *
     * @param {Array} elms
     * @return {Array}
     */
    function _uniqueness(elms) {
        var idx = {}, rv = [], e, i = 0, uid, p = 0;
        while (e = elms[i++]) {
            uid = e.uniqueId || (e.uniqueId = ++ELEMENT_UID);
            if (!idx[uid]) {
                idx[uid] = true;
                rv[p++] = e;
            }
        }
        return rv;
    }

    /**
     * 属性セレクタ（フィルタリング）
     *
     * @param {Array} elms
     * @param {String} opr
     * @param {String} attr
     * @param {String} crit
     */
    function _attribute(elms, opr, attr, crit) {
        var rv = [], e, i = 0, p = 0;

        switch (EVALUATE_ATTRIBUTE[opr]) {
            case ATTRIBUTE_EQUAL :
                while (e = elms[i++]) {
                    if (getAttr(e, attr) === crit) {
                        rv[p++] = e;
                    }
                }
            break;
            case ATTRIBUTE_END:
                while (e = elms[i++]) {
                    if (new RegExp(crit+'$').test(getAttr(e, attr))) {
                        rv[p++] = e;
                    }
                }
            break;
            case ATTRIBUTE_START:
                while (e = elms[i++]) {
                    if (getAttr(e, attr).indexOf(crit) === 0) {
                        rv[p++] = e;
                    }
                }
            break;
            case ATTRIBUTE_CONTAIN:
                while (e = elms[i++]) {
                    if (getAttr(e, attr).indexOf(crit) !== -1) {
                        rv[p++] = e;
                    }
                }
            break;
            case ATTRIBUTE_PART:
                crit =  ' '+crit+' ';
                while (e = elms[i++]) {
                    if ((' '+getAttr(e, attr)+' ').indexOf(crit) !== -1) {
                        rv[p++] = e;
                    }
                }
            break;
            case ATTRIBUTE_NOT:
                while (e = elms[i++]) {
                    if (getAttr(e, attr) !== crit) {
                        rv[p++] = e;
                    }
                }
            break;
            case ATTRIBUTE_HAS:
                while (e = elms[i++]) {
                    if (getAttr(e, attr) !== '') {
                        rv[p++] = e;
                    }
                }
            break;
        }
        return rv;
    }

    /**
     * 擬似クラスセレクタ（フィルタリング）
     *
     * @param {Array} elms
     * @param {String} pseudo
     * @param {String} arg
     */
    function _pseudos(elms, pseudo, arg) {
        /**
         * nth-child等の引数をパースする
         *
         * @param {String} arg
         */
        function _argParse(arg) {
            // matches[1] index \d
            //        [2] n     n
            //        [3] sign  +|-
            //        [4] num   \d
            var matches = /^(\d*)(n?)([+-]?)(\d*)$/.exec(arg),
                rv = {
                    i : ~~matches[1],
                    n : !!matches[2],
                    fix : !!matches[3] ? matches[3] === '+' ? -~~matches[4] : ~~matches[4]
                                       : 0
            };
            if (rv.i === 0 && !!rv.n) {
                rv.i = 1;
            }
            return rv;
        }

        var rv = [], i = 0, e, p = 0,
            flg, start, iter,
            pe,
            pos, node, args,
            current,

            root, nots, idx = {}, attr;

        if (pseudo.indexOf('-') !== -1) {

            // 予約語を変換
            switch(arg) {
                case 'even' :
                    arg = '2n';
                break;
                case 'odd'  :
                    arg = '2n-1';
                break;
            }

            // イテレータ等の決定
            if (pseudo.indexOf('last') === -1) {
                flg   = 'ascIndexed';
                start = 'firstChild';
                iter  = 'nextSibling';
            } else {
                flg   = 'descIndexed';
                start = 'lastChild';
                iter  = 'previousSibling';
            }

            switch (EVALUATE_PSEUDO[pseudo]) {
                case PSEUDO_NTHCHILD: // nth-child, nth-last-child, only-child
                    args = _argParse(arg);

                    while (e = elms[i++]) {
                        // 親ノード単位でindex済みのフラグを記録する
                        // セレクター走査後に，countとstoreは初期化される
                        pe = e.parentNode;
                        pe[flg] || (pe[flg] = ++INDEXED_COUNT);
                        if (!INDEXED_STORE[pe[flg]]) {
                            INDEXED_STORE[pe[flg]] = true;
                            node = pe[start];
                            pos  = 0;
                            for (; node; node = node[iter]) {
                                if (node.nodeType === 1) {
                                    node.nodeIndex = ++pos;
                                }
                            }
                            // posが1であればその要素はonly-childである
                            if (pos === 1) {
                                e.onlyChild = true;
                            }
                        }

                        // only-child
                        if (pseudo.indexOf('only') !== -1) {
                            if (e.onlyChild && e.onlyChild === true) {
                                rv[p++] = e;
                            }
                        // nth-child, nth-last-child
                        } else {
                            current = e.nodeIndex + args.fix;
                            if (!!args.n) {
                                if (current % args.i === 0 && current / args.i >= 0) {
                                    rv[p++] = e;
                                }
                            } else {
                                if (current === args.i) {
                                    rv[p++] = e;
                                }
                            }
                        }
                    }
                break;
                case PSEUDO_FLCHILD: // first-child, last-child
                    while (e = elms[i++]) {
                        node = e.parentNode[start];
                        for (; node; node = node[iter]) {
                            if (node.nodeType === 1) {
                                if (node === e) {
                                    rv[p++] = e;
                                } else {
                                    break;
                                }
                            }
                        }
                    }
                break;
                case PSEUDO_NTHTYPE:  // nth-of-type, nth-last-of-type
                case PSEUDO_FLTYPE:   // first-of-type, last-of-type
                case PSEUDO_ONLYTYPE: // only-of-type
                default:
                    throw new Error("pseudo '"+pseudo+"' is not implmented.");
                break;
            }
        } else {
            switch (EVALUATE_PSEUDO[pseudo]) {
                case PSEUDO_UISTATE:
                    nots = true;
                    if (pseudo === 'enabled') {
                        pseudo = 'disabled';
                        nots   = false;
                    }
                    while(e = elms[i++]) {
                        if (e[pseudo] !== void 0 && e[pseudo] === nots) {
                            rv[p++] = e;
                        }
                    }
                break;
                case PSEUDO_NOT :
                    root = elms[0] ? elms[0].ownerDocument.html
                                   : doc.html;
                    nots = query(arg, root);
                    while (node = nots[i++]) {
                        idx[node.uniqueId] = true;
                    }
                    i = 0;
                    while (e = elms[i++]) {
                        if (!e.uniqueId || !idx[e.uniqueId] ) {
                            rv[p++] = e;
                        }
                    }
                break;
                case PSEUDO_FOCUS:
                    root = elms[0] ? elms[0].ownerDocument.html
                                   : doc.html;
                    while (e = elms[i++]) {
                        if (e === root.activeElement) {
                            rv[p++] = e;
                        }
                    }
                break;
                case PSEUDO_CONTAINS:
                    while (e = elms[i++]) {
                        if ((e.textContent || e.innerText).indexOf(arg) !== -1) {
                            rv[p++] = e;
                        }
                    }
                break;
                case PSEUDO_ROOT:
                    e = elms[0] ? elms[0].ownerDocument.html
                                : doc.html;
                    rv[p++] = e;
                break;
                case PSEUDO_EMPTY:
                    while (e = elms[i++]) {
                        if (!e.firstChild) {
                            rv[p++] = e;
                        }
                    }
                break;
                case PSEUDO_TARGET:
                    attr = loc.hash.substr(1);
                    while (e = elms[i++]) {
                        if (e.id === attr) {
                            rv[p++] = e;
                        }
                    }
                break;
                case PSEUDO_LANG:
                    while (e = elms[i++]) {
                        attr = getAttr(e, 'lang');
                        if (!!attr && attr.indexOf(arg) === 0 ) {
                            rv[p++] = e;
                        }
                    }
                break;
                case PSEUDO_UNDEFINED:
                default :
                    throw new Error("pseudo '"+pseudo+"' is not implmented.");
                break;
            }
        }
        return rv;
    }
})(window, document, location, navigator);