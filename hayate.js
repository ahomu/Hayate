/**
 * Hayate.js
 *
 * ハヤテのごとくを見ながら作られたから
 * せめてSizzleを上回りたい
 */
var Hayate;
Hayate || (function(win, doc, loc, nav) {

    Hayate = queryAll;

    var oldIE   = /MSIE [678]/.test(nav.userAgent),
        toArray = !!oldIE ? toArrayClone : toArraySlice,
        IE_FIX_ATTR = {
            'class'     : 'className',
            'for'       : 'htmlFor',
            acesskey    : 'accessKey',
            tabindex    : 'tabIndex',
            colspan     : 'colSpan',
            rowspan     : 'rowSpan',
            frameborder : 'frameBorder'
    };

    /**
     * ArrayっぽいObject(NodeList, HTMLCollection)を，Arrayに変換
     *
     * @param {Object} list
     */
    function toArrayClone(list) {
        var rv= new Array(list.length), i = list.length;
        for (; i-->0;)
            if (i in list) {
                rv[i]= list[i];
            }
        return rv;
    }
    /**
     * ArrayっぽいObject(NodeList, HTMLCollection)を，Arrayに変換
     *
     * @param {Object} list
     */
    function toArraySlice(list) {
        return Array.prototype.slice.call(list);
    }

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

    function queryAll(expr, root) {
        var exprStack, i,
            RE_CONCISE = /^([.#]?)[\w\-_]+$/,
            rv;

        root = root || doc;

        // 短絡評価が可能なら済ませる
        if (RE_CONCISE.test(expr)) {
            return _concise(expr, root);
        }

        if (expr.indexOf(',') === -1) {
            return _selector(expr, root);
        } else {
            exprStack = expr.split(',');

            rv = [];
            i  = 0;
            while (expr = exprStack[i++]) {
                rv = rv.concat(_selector(expr, root));
            }
            return rv;
        }
    }

    function _selector(expr, root) {
        var i = 0,
            tokenGroup,
            token,
            RE_STANDARD   = /^([a-z]*)([.#]?[a-zA-Z0-9-_]*)$/,
            RE_COMBINATOR = /^([>+~])?$/,
            RE_ATTRIBUTE  = /^\[(.+?)([~^$*|!>])=(.+?)\]$/,
            RE_PSEUDOS    = /^:([a-z-]+)\(?([a-z-+\d]*)\)?$/,
            matches,
            rv;

        // IDがあればそれ以前を切り取る
        if (expr.indexOf('#')) {
            expr = expr.replace(/^.*?([a-z]*#.+)$/, '$1');
        }

        // 生のセレクタストリングを加工
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
            .replace(/^\s*|\s*$/g, '')
        ;

        // セレクタを評価単位に分割
        tokenGroup = expr.split(' ');

        // 評価中変数を初期化
        rv = [root];

        while (token = tokenGroup[i++]) {

            switch(token.charAt(0)) {
                case '[':
                    // attribute
                    if (matches = RE_ATTRIBUTE.exec(token)) {
                        // matches[1] attribute
                        //        [2] operator
                        //        [3] criterion
                        rv = _attribute(rv, matches[2], matches[1], matches[3]);
                    }
                break;
                case ':':
                    // pseudos
                    if (matches = RE_PSEUDOS.exec(token)) {
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
                    if (matches = RE_STANDARD.exec(token)) {
                        // matches[1] element tag
                        //        [2] class|ident
                        if (!matches[2]) {
                            rv = _tag(matches[1], rv);
                        } else {
                            switch (matches[2].charAt(0)) {
                                case '#':
                                    rv = _ident(matches[2].substr(1), root, matches[1]);
                                break;
                                case '.':
                                    rv = _clazz(matches[2].substr(1), rv, matches[1]);
                                break;
                            }
                        }
                    }
                break;
            }
        }

        return rv;
    }

    function _concise(expr, root) {
        var rv = [];
        switch(expr.charAt(0)) {
            case '#':
                rv = _ident(expr.substr(1), root);
            break;
            case '.':
                rv = _clazz(expr.substr(1), [root]);
            break;
            default:
                rv = _tag(expr, [root]);
            break;
        }
        return rv;
    }

    /**
     *
     * @param {String} ident
     * @param {Element} root
     * @param {String} [tagName]
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
     *
     * @param {String} clazz
     * @param {Array} rootAry
     * @param {String} [tagName]
     */
    function _clazz(clazz, rootAry, tagName) {
        tagName  = tagName && tagName.toUpperCase();

        var rv = [], i = 0, root, tmp;

        while (root = rootAry[i++] ) {
            if (!root.getElementsByClassName) {
                var elms    = root.getElementsByTagName('*'),
                    evClass = [' ', clazz, ' '].join(''),
                    elClass = [' ', , ' '],
                    j       = 0,
                    e;

                while (e = elms[j++]) {
                    elClass[1] = e.className;
                    if (elClass.join('').indexOf(evClass) !== -1) {
                        if (!tagName || e.tagName === tagName) {
                            rv.push(e);
                        }
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

    function _tag(tagName, rootAry) {
        var rv = [], i = 0, root;

        while (root = rootAry[i++]) {
            rv = concatArray(rv, root.getElementsByTagName(tagName));
        }

        return rv;
    }

    function _attribute(elms, opr, attr, crit) {
        var rv = [], e, i = 0;

        crit = opr === '~' ? ' '+opr+' '
                           : opr;

        switch (opr) {
            case '' :
                while (e = elms[i++]) {
                    if (getAttr(e, attr) === crit) {
                        rv.push(e);
                    }
                }
                break;
            case '$':
                while (e = elms[i++]) {
                    if (new RegExp(crit+'$').test(getAttr(e, attr))) {
                        rv.push(e);
                    }
                }
                break;
            case '^':
                while (e = elms[i++]) {
                    if (getAttr(e, attr).indexOf(crit) === 0) {
                        rv.push(e);
                    }
                }
                break;
            case '*':
                while (e = elms[i++]) {
                    if (getAttr(e, attr).indexOf(crit) !== -1) {
                        rv.push(e);
                    }
                }
                break;
            case '~':
                while (e = elms[i++]) {
                    if ((' '+getAttr(e, attr)+' ').indexOf(crit) !== -1) {
                        rv.push(e);
                    }
                }
                break;
            case '|':
                while (e = elms[i++]) {
                    if (getAttr(e, attr) === crit) {
                        rv.push(e);
                    }
                }
                break;
        }
        return rv;
    }

    function _pseudos(elms, opr, arg) {
        return elms;
    }

    function _combinator(elms, comb) {
        return elms;
    }

    function getAttr(elm, key) {
        if (!!oldIE && key in IE_FIX_ATTR) {
            key = IE_FIX_ATTR[key];
        }
        return elm.getAttribute(key);
    }
})(window, document, location, navigator);
