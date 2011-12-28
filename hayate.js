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
        toArray = !!oldIE ? toArrayClone : toArraySlice;

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

    function queryAll(expr, root) {
        var exprStack, i, iz,
            exprGroup, j, jz,
            exprToken,
            RE_STANDARD   = /^([a-z]*)([.#]?[a-zA-Z0-9-_]*)$/,
            RE_COMBINATOR = /^([>+~])?$/,
            RE_ATTRIBUTE  = /^\[(.+?)([~^$*|!>])=(.+?)\]$/,
            RE_PSEUDOS    = /^:([a-z-]+)\(?([a-z-+\d]*)\)?$/,
            RE_CONCISE    = /^([.#]?)[\w\-_]+$/,
            matches,
            evaluating,
            processing,
            rv = [];

        root = root || doc;

        // 短絡評価が可能なら済ませる
        if (RE_CONCISE.test(expr)) {
            return _concise(expr, root);
        }

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
            // 複数指定のカンマ区切りの両脇をトリム
            .replace(/\s?,\s?/g, ',')
        ;

        if (expr.indexOf(',')) {

        }

        // 複数のセレクタに分解
        exprStack = expr.split(',');

        i  = 0;
        iz = exprStack.length;
        for (; i<iz; i++) {

            // セレクタを評価単位に分割
            exprGroup = exprStack[i].split(' ');

            // 評価中変数を初期化
            evaluating = [root];

            j  = 0;
            jz = exprGroup.length;
            for (; j<jz; j++) {

                exprToken = exprGroup[j].trim();

                switch(exprToken.charAt(0)) {
                    case '[':
                        // attribute
                        if (matches = RE_ATTRIBUTE.exec(exprToken)) {
                            // matches[1] attribute
                            //        [2] operator
                            //        [3] criterion
                            evaluating = _attribute(evaluating, matches[2], matches[1], matches[3]);
                        }
                    break;
                    case ':':
                        // pseudos
                        if (matches = RE_PSEUDOS.exec(exprToken)) {
                            // matches[1] pseudo
                            //        [2] argutment
                            evaluating = _pseudos(evaluating, matches[1], matches[2]);
                        }
                    break;
                    case '>':
                    case '~':
                    case '+':
                        evaluating = _combinator(evaluating, exprToken.charAt(0));

                        // fall down
                        exprToken = exprToken.substr(1);
                        if (matches = RE_STANDARD.exec(exprToken)) {
                            // matches[1] element tag
                            //        [2] class|ident
                            if (!matches[2]) {
                                evaluating = _tag(matches[1], evaluating);
                            } else {
                                switch (matches[2].charAt(0)) {
                                    case '#':
                                        evaluating = _ident(matches[2].substr(1), root, matches[1]);
                                    break;
                                    case '.':
                                        evaluating = _clazz(matches[2].substr(1), evaluating, matches[1]);
                                    break;
                                }
                            }
                        }
                    break;
                    default :
                        if (matches = RE_STANDARD.exec(exprToken)) {
                            // matches[1] element tag
                            //        [2] class|ident
                            if (!matches[2]) {
                                evaluating = _tag(matches[1], evaluating);
                            } else {
                                switch (matches[2].charAt(0)) {
                                    case '#':
                                        evaluating = _ident(matches[2].substr(1), root, matches[1]);
                                    break;
                                    case '.':
                                        evaluating = _clazz(matches[2].substr(1), evaluating, matches[1]);
                                    break;
                                }
                            }
                        }
                    break;
                }
            }
            // 結果に結合
            rv = rv.concat(evaluating);
        }

        return rv;
    }

    function _selector(expr, root) {

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
     * @param {Array} root
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

        var rvStack = [], i = 0, root;

        while (root = rootAry[i++] ) {
            if (root.getElementsByClassName) {
                rvStack = rvStack.concat(toArray(root.getElementsByClassName(clazz)));
            } else {
                var elms    = root.getElementsByTagName('*'),
                    evClass = [' ', clazz, ' '].join(''),
                    elClass = [' ', , ' '],
                    rv      = [],
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
                rvStack = rvStack.concat(rv);
            }
        }
        return rvStack;
    }

    function _tag(tagName, rootAry) {
        var rvStack = [], i = 0, root;

        while (root = rootAry[i++]) {
            rvStack = rvStack.concat(toArray(root.getElementsByTagName(tagName)));
        }
        return rvStack;
    }

    function _attribute(elms, opr, attr, crit) {
        var rv = [], e, i = 0;

        crit = opr === '~' ? ' '+opr+' '
                           : opr;

        switch (opr) {
            case '' :
                while (e = elms[i++]) {
                    if (e.getAttribute(attr) === crit) {
                        rv.push(e);
                    }
                }
                break;
            case '$':
                while (e = elms[i++]) {
                    if (new RegExp(crit+'$').test(e.getAttribute(attr))) {
                        rv.push(e);
                    }
                }
                break;
            case '^':
                while (e = elms[i++]) {
                    if (e.getAttribute(attr).indexOf(crit) === 0) {
                        rv.push(e);
                    }
                }
                break;
            case '*':
                while (e = elms[i++]) {
                    if (e.getAttribute(attr).indexOf(crit) !== -1) {
                        rv.push(e);
                    }
                }
                break;
            case '~':
                while (e = elms[i++]) {
                    if ((' '+e.getAttribute(attr)+' ').indexOf(crit) !== -1) {
                        rv.push(e);
                    }
                }
                break;
            case '|':
                while (e = elms[i++]) {
                    if (e.getAttribute(attr) === crit) {
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

})(window, document, location, navigator);
