/**
 * Hayate.js
 *
 * ハヤテのごとくを見ながら作られたから
 * せめてSizzleを上回りたい
 */
var Hayate;
Hayate || (function(win, doc, loc, nav) {

    "use strict";

    Hayate = query;

    var oldIE   = /MSIE [678]/.test(nav.userAgent),
        toArray = !!oldIE ? toArrayCopy : toArraySlice,
        IE_FIX_ATTR = {
            'class'     : 'className',
            'for'       : 'htmlFor',
            acesskey    : 'accessKey',
            tabindex    : 'tabIndex',
            colspan     : 'colSpan',
            rowspan     : 'rowSpan',
            frameborder : 'frameBorder'
        },
        INDEXED_STORE = {},
        INDEXED_COUNT = 0
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
     * arrayにlistを加える
     *
     * @param {Array} array
     * @param {Object} list
     */
    function concatArray(array, list) {
        if (!oldIE) {
            return array.concat(Array.prototype.slice.call(list));
        } else {
            var j = array.length, i = list.length;
            for (; i-->0;) {
                if (i in list) {
                    array[j++]= list[i];
                }
            }
            return array;
        }
    }

    /**
     * 属性値を取得する
     *
     * @param elm
     * @param key
     */
    function getAttr(elm, key) {
        if (!!oldIE && key in IE_FIX_ATTR) {
            key = IE_FIX_ATTR[key];
        }
        return elm.getAttribute(key);
    }

    /**
     * クエリーセレクタ
     *
     * @param expr
     * @param root
     */
    function query(expr, root) {
        var exprStack, i,
            RE_CONCISE = /^([.#]?)[\w\-_]+$/,
            rv;

        // @todo issue: 適宜ネイティブのquerySelectorAllと分岐する(IE8はpseudoの実装が半端なので注意)

        root = root || doc;

        // 短絡評価が可能なら済ませる
        if (RE_CONCISE.test(expr)) {
            return _concise(expr, root);
        }

        if (expr.indexOf(',') === -1) {
            rv = _selector(expr, root);
        } else {
            exprStack = expr.split(',');

            rv = [];
            i  = 0;
            while (expr = exprStack[i++]) {
                rv = rv.concat(_selector(expr, root));
            }
        }

        // 要素のインデックスを初期化
        INDEXED_STORE = {};
        INDEXED_COUNT = 0;

        return rv;
    }

    /**
     * querySelectorAllの代替
     *
     * @param expr
     * @param root
     */
    function _selector(expr, root) {
        var i = 0,
            tokenGroup,
            token,
            RE_PARSE_STANDARD   = /^([a-z0-9*]*)([.#]?[\w_-]*)$/,
            RE_PARSE_COMBINATOR = /^([>+~])?$/,
            RE_PARSE_ATTRIBUTE  = /^\[(.+?)([~^$*|!>]?=)(.+)\]$/,
            RE_PARSE_PSEUDO     = /^:([a-z-]+)\(?([a-z-+\d]*)\)?$/,
            matches,
            rv;

        // IDがあればそれ以前を切り取る
        if (expr.indexOf('#')) {
            expr = expr.replace(/^.*?([a-z0-9*]*#.+)$/, '$1');
        }

        // 生のセレクタ文字列を加工
        expr = expr
            // 2つ以上のスペースを1つに変換
            .replace(/\s{2,}/g, ' ')
            // クオーテーションを除去
            .replace(/['"]/g, '')
            // combinatorの左脇にスペース
            .replace(/\s?>\s?/g, ' >')
            .replace(/\s?~\s?([^=])/g, ' ~$1')    // [attr~="\w"]でない
            .replace(/\s?\+\s?([^\d])/g, ' +$1')  // :pusedo(n+\d)でない
            // attributeの左脇にスペース
            .replace(/\s?\[/g, ' [')
            // pseudosの左脇にスペース
            .replace(/\s?:/g, ' :')
            // trim
            .replace(/^\s+/, '').replace(/\s+$/, '')
        ;

        // 評価変数を初期化
        rv = [root];

        // セレクタを評価単位に分割
        tokenGroup = expr.split(' ');

        while (token = tokenGroup[i++]) {
            switch(token.charAt(0)) {
                case '[':
                    // attribute
                    if (matches = RE_PARSE_ATTRIBUTE.exec(token)) {
                        // matches[1] attribute
                        //        [2] operator
                        //        [3] criterion
                        rv = _attribute(rv, matches[2], matches[1], matches[3]);
                    } else {
                        rv = _attribute(rv, '', token.replace(']', '').charAt(1), '');
                    }
                break;
                case ':':
                    // pseudos
                    if (matches = RE_PARSE_PSEUDO.exec(token)) {
                        // matches[1] pseudo
                        //        [2] argutment
                        rv = _pseudos(rv, matches[1], matches[2]);
                    }
                break;
                case '>':
                case '~':
                case '+':
                    // combinator
                    rv = _combinator(rv, token.charAt(0));

                    // remove combinator
                    token = token.substr(1);

                    // through down
                default :
                    if (matches = RE_PARSE_STANDARD.exec(token)) {
                        // matches[1] element tag
                        //        [2] class|ident
                        switch (matches[2].charAt(0)) {
                            case '#':
                                rv = _ident(matches[2].substr(1), root, matches[1]);
                            break;
                            case '.':
                                rv = _class(matches[2].substr(1), rv, matches[1]);
                            break;
                            default :
                                rv = _tag(matches[1], rv);
                            break;
                        }
                    }
                break;
            }
        }
        return rv;
    }

    /**
     * 短絡評価
     * 簡潔なセレクタをより速く評価する
     *
     * @param {String} expr
     * @param {Node} root
     */
    function _concise(expr, root) {
        var rv = [];
        switch(expr.charAt(0)) {
            case '#':
                rv = _ident(expr.substr(1), root);
            break;
            case '.':
                rv = _class(expr.substr(1), [root]);
            break;
            default:
                rv = _tag(expr, [root]);
            break;
        }
        return rv;
    }

    /**
     * IDセレクタ
     *
     * @param {String} ident
     * @param {Node} root
     * @param {String} [tagName]
     * @return {Array}
     */
    function _ident(ident, root, tagName) {
        var rv;

        tagName = tagName && tagName.toUpperCase();
        root    = root.nodeType === 9 ? root : root.ownerDocument;

        rv = root.getElementById(ident);

        if (rv && !tagName || rv && rv.tagName === tagName) {
            return [rv];
        } else {
            return []
        }
    }

    /**
     * クラスセレクタ
     *
     * @param {String} clazz
     * @param {Array} rootAry
     * @param {String} [tagName]
     * @return {Array}
     */
    function _class(clazz, rootAry, tagName) {
        var rv = [], i = 0, root, tmp;

        tagName  = tagName && tagName.toUpperCase();

        while (root = rootAry[i++] ) {
            if (!root.getElementsByClassName) {
                var elms    = root.getElementsByTagName(tagName || '*'),
                    evClass = ' '+clazz+' ',
                    j       = 0,
                    e;

                while (e = elms[j++]) {
                    if ((''+e.className+'').indexOf(evClass) !== -1) {
                        rv.push(e);
                    }
                }
            } else {
                tmp = toArray(root.getElementsByClassName(clazz));
                if (tagName) {
                    var k = 0, r;
                    while (r = tmp[k++]) {
                        if (r.tagName === tagName) {
                            rv.push(r);
                        }
                    }
                } else {
                    rv = rv.concat(tmp);
                }
            }
        }
        return rv;
    }

    /**
     * タグセレクタ
     *
     * @param {String} tagName
     * @param {Array} rootAry
     * @return {Array}
     */
    function _tag(tagName, rootAry) {
        var rv = [], i = 0, root;

        while (root = rootAry[i++]) {
            rv = concatArray(rv, root.getElementsByTagName(tagName));
        }

        return rv;
    }

    /**
     * 属性セレクタ
     * []内に記号類が混ざると，事前パースの時点で撃沈するので単純な文字列を対象に使うつもりで（ようは低精度）
     *
     * @param {Array} elms
     * @param {String} opr
     * @param {String} attr
     * @param {String} crit
     */
    function _attribute(elms, opr, attr, crit) {
        var rv = [], e, i = 0;

        crit = opr === '~' ? ' '+crit+' '
                           : crit;
        switch (opr) {
            case '=' :
                while (e = elms[i++]) {
                    if (getAttr(e, attr) === crit) {
                        rv.push(e);
                    }
                }
            break;
            case '$=':
                while (e = elms[i++]) {
                    if (new RegExp(crit+'$').test(getAttr(e, attr))) {
                        rv.push(e);
                    }
                }
            break;
            case '^=':
                while (e = elms[i++]) {
                    if (getAttr(e, attr).indexOf(crit) === 0) {
                        rv.push(e);
                    }
                }
            break;
            case '*=':
                while (e = elms[i++]) {
                    if (getAttr(e, attr).indexOf(crit) !== -1) {
                        rv.push(e);
                    }
                }
            break;
            case '~=':
                while (e = elms[i++]) {
                    if ((' '+getAttr(e, attr)+' ').indexOf(crit) !== -1) {
                        rv.push(e);
                    }
                }
            break;
            case '|=':
                while (e = elms[i++]) {
                    if (getAttr(e, attr) === crit) {
                        rv.push(e);
                    }
                }
            break;
            case '!='  :
                while (e = elms[i++]) {
                    if (getAttr(e, attr) !== crit) {
                        rv.push(e);
                    }
                }
            break;
            case ''  :
                while (e = elms[i++]) {
                    if (getAttr(e, attr) !== '') {
                        rv.push(e);
                    }
                }
            break;
        }
        return rv;
    }

    /**
     * 擬似クラスセレクタ
     *
     * :opr(arg)
     * arg内にホワイトスペースが含まれない前提でパース
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
            var RE_ARG_PARSE = /^(\d*)(n?)([+-]?)(\d*)$/,
                matches = RE_ARG_PARSE.exec(arg),
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

        var rv = [], i = 0, e,
            flg, start, iter,
            pe,
            pos, node, args,
            current;

        // 予約語を変換
        switch(arg) {
            case 'even' :
                arg = '2n';
            break;
            case 'odd'  :
                arg = '2n-1';
            break;
        }

        if (pseudo.indexOf('-') !== -1) {

            var CONST_PSEUDO = {
                'only-child'       : 1,
                'nth-child'        : 1,
                'nth-last-child'   : 1,
                'first-child'      : 2,
                'last-child'       : 2,
                'nth-of-type'      : 3,
                'nth-last-of-type' : 3,
                'first-of-type'    : 4,
                'last-of-type'     : 4,
                'only-of-type'     : 5
            };

            if (pseudo.indexOf('last') === -1) {
                flg   = 'ascIndexed';
                start = 'firstChild';
                iter  = 'nextSibling';
            } else {
                flg   = 'descIndexed';
                start = 'lastChild';
                iter  = 'previousSibling';
            }

            switch (CONST_PSEUDO[pseudo]) {
                case 1: // nth-child, nth-last-child, only-child
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
                                rv.push(e);
                            }
                        // nth-child, nth-last-child
                        } else {
                            current = e.nodeIndex + args.fix;
                            if (!!args.n) {
                                if (current % args.i === 0 && current / args.i >= 0) {
                                    rv.push(e);
                                }
                            } else {
                                if (current === args.i) {
                                    rv.push(e);
                                }
                            }
                        }
                    }
                break;
                case 2: // first-child, last-child
                    while (e = elms[i++]) {
                        node = e.parentNode[start];
                        for (; node; node = node[iter]) {
                            if (node.nodeType === 1) {
                                if (node === e) {
                                    rv.push(e);
                                } else {
                                    break;
                                }
                            }
                        }
                    }
                break;
                case 3: // nth-of-type, nth-last-of-type
                case 4: // first-of-type, last-of-type
                case 5: // only-of-type
                    throw new Error("pseudo 'of-type's are not implmented.");
                break;
            }
        } else {
            switch (pseudo) {
                case 'root' :
                break;
                case 'empty' :
                break;
                case 'link' :
                break;
                case 'visited' :
                break;
                case 'active' :
                break;
                case 'hover' :
                break;
                case 'focus' :
                break;
                case 'target' :
                break;
                case 'lang' :
                break;
                case 'enabled' :
                break;
                case 'disabled' :
                break;
                case 'checked' :
                break;
            }
        }
        return rv;
    }

    /**
     * 子・隣接・関節セレクタ
     *
     * @param {Array} elms
     * @param {String} comb
     */
    function _combinator(elms, comb) {
        return elms;
    }

})(window, document, location, navigator);
