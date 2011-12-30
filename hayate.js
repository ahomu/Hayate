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
        INDEXED_COUNT = 0,

        PSEUDO_NTHCHILD   = 1,
        PSEUDO_FLCHILD    = 2,
        PSEUDO_NTHTYPE    = 3,
        PSEUDO_FLTYPE     = 4,
        PSEUDO_ONLYTYPE   = 5,

        ATTRIBUTE_EQUAL   = 1,
        ATTRIBUTE_END     = 2,
        ATTRIBUTE_START   = 3,
        ATTRIBUTE_CONTAIN = 4,
        ATTRIBUTE_PART    = 5,
        ATTRIBUTE_NOT     = 6,
        ATTRIBUTE_HAS     = 7
    ;

    var EVALUTE_PSEUDO = {
        'only-child'       : PSEUDO_NTHCHILD,
        'nth-child'        : PSEUDO_NTHCHILD,
        'nth-last-child'   : PSEUDO_NTHCHILD,
        'first-child'      : PSEUDO_FLCHILD,
        'last-child'       : PSEUDO_FLCHILD,
        'nth-of-type'      : PSEUDO_NTHTYPE,
        'nth-last-of-type' : PSEUDO_NTHTYPE,
        'first-of-type'    : PSEUDO_FLTYPE,
        'last-of-type'     : PSEUDO_FLTYPE,
        'only-of-type'     : PSEUDO_ONLYTYPE
    },
        EVALUTE_ATTRIBUTE = {
        '='  : ATTRIBUTE_EQUAL,
        '$=' : ATTRIBUTE_END,
        '^=' : ATTRIBUTE_START,
        '*=' : ATTRIBUTE_CONTAIN,
        '~=' : ATTRIBUTE_PART,
        '|=' : ATTRIBUTE_EQUAL,
        '!=' : ATTRIBUTE_NOT,
        ''   : ATTRIBUTE_HAS
    };
    
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
     * @param {Node} elm
     * @param {String} key
     * @return {String}
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
     * @param {String} expr
     * @param {Node|Document} root
     * @return {Array}
     */
    function query(expr, root) {
        var exprStack, i,
            RE_CONCISE = /^([a-z0-6]*)([.#]?)([\w\-_]*)$/,
            matches, rv;

        // @todo issue: 適宜ネイティブのquerySelectorAllと分岐する(IE8はpseudoの実装が半端なので注意)

        root = root || doc;

        // 短絡評価が可能なら済ませる
        if (matches = RE_CONCISE.exec(expr)) {
            // matches[1] tagName
            //        [2] by
            //        [3] specifier
            return _concise(matches[1] || '*', root, matches[3], matches[2]);
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
     * @param {String} expr
     * @param {Node|Document} root
     * @return {Array}
     */
    function _selector(expr, root) {
        var i = 0,
            tokenGroup,
            token,
            RE_DETECT_COMBINATOR = /^([>+~])/,
            RE_DETECT_TAGNAME    = /^([a-z0-6]+)[#.[:]?/,
            RE_DETECT_SPECIFIER  = /^([#.])([a-zA-Z0-9-_]+)/,
            RE_PARSE_ATTRIBUTE   = /^\[(.+?)([~^$*|!>]?=)(.+)\]$/,
            RE_PARSE_PSEUDO      = /^:([a-z-]+)\(?([a-z-+\d]*)\)?$/,
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

        var combinator, tagName, traversal, specifier,
            filterGroup, filter, fi;

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
            // @todo issue: combinatorを考慮
            rv = traversal(tagName, rv, specifier);

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
     * @param {Node} root
     * @param {String} specifier
     * @param {String} by
     * @return {Array}
     */
    function _concise(tagName, root, specifier, by) {
        var rv = [];
        switch(by) {
            case '#':
                rv = _ident(tagName, [root], specifier);
            break;
            case '.':
                rv = _class(tagName, [root], specifier);
            break;
            default:
                rv = _tag(tagName, [root]);
            break;
        }
        return rv;
    }

    /**
     * IDセレクタ
     *
     * @param {String} tagName
     * @param {Array} root (document nodeがroot[0]に入ってくる前提)
     * @param {String} ident
     * @return {Array}
     */
    function _ident(tagName, root, ident) {
        var rv;

        tagName = tagName.toUpperCase();
        root    = root[0].nodeType === 9 ? root[0] : root[0].ownerDocument;

        rv = root.getElementById(ident);

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
     * @param {Array} rootAry
     * @param {String} clazz
     * @return {Array}
     */
    function _class(tagName, rootAry, clazz) {
        var rv = [], i = 0, root, tmp;

        tagName  = tagName.toUpperCase();

        while (root = rootAry[i++] ) {
            if (!root.getElementsByClassName) {
                var elms    = root.getElementsByTagName(tagName),
                    evClass = ' '+clazz+' ',
                    j       = 0,
                    e;

                while (e = elms[j++]) {
                    if ((' '+e.className+' ').indexOf(evClass) !== -1) {
                        rv.push(e);
                    }
                }
            } else {
                tmp = toArray(root.getElementsByClassName(clazz));
                if (tagName !== '*') {
                    console.log(tagName);
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
     * 子・隣接・間接セレクタ
     *
     * @param {Array} elms
     * @param {String} comb
     */
    function _combinator(elms, comb) {



        return elms;
    }

    /**
     * 属性セレクタ（フィルタリング）
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

        switch (EVALUTE_ATTRIBUTE[opr]) {
            case ATTRIBUTE_EQUAL :
                while (e = elms[i++]) {
                    if (getAttr(e, attr) === crit) {
                        rv.push(e);
                    }
                }
            break;
            case ATTRIBUTE_END:
                while (e = elms[i++]) {
                    if (new RegExp(crit+'$').test(getAttr(e, attr))) {
                        rv.push(e);
                    }
                }
            break;
            case ATTRIBUTE_START:
                while (e = elms[i++]) {
                    if (getAttr(e, attr).indexOf(crit) === 0) {
                        rv.push(e);
                    }
                }
            break;
            case ATTRIBUTE_CONTAIN:
                while (e = elms[i++]) {
                    if (getAttr(e, attr).indexOf(crit) !== -1) {
                        rv.push(e);
                    }
                }
            break;
            case ATTRIBUTE_PART:
                while (e = elms[i++]) {
                    if ((' '+getAttr(e, attr)+' ').indexOf(crit) !== -1) {
                        rv.push(e);
                    }
                }
            break;
            case ATTRIBUTE_NOT:
                while (e = elms[i++]) {
                    if (getAttr(e, attr) !== crit) {
                        rv.push(e);
                    }
                }
            break;
            case ATTRIBUTE_HAS:
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
     * 擬似クラスセレクタ（フィルタリング）
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

            switch (EVALUTE_PSEUDO[pseudo]) {
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
                case PSEUDO_FLCHILD: // first-child, last-child
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
                case PSEUDO_NTHTYPE: // nth-of-type, nth-last-of-type
                case PSEUDO_FLTYPE: // first-of-type, last-of-type
                case PSEUDO_ONLYTYPE: // only-of-type
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
})(window, document, location, navigator);
