;;; Run from any directory with: sbcl --script scripts/test-build-seo.lisp
(load (merge-pathnames "build-seo.lisp" *load-truename*))

(defun rejects-json-p (text)
  (handler-case (progn (read-json text) nil) (error () t)))

;; Unicode escapes, surrogate pairs, nested values, and empty collections.
(assert (equal (read-json "\"\\u9577\\u702c\\uD83D\\uDE00\"") "長瀬😀"))
(assert (equal (read-json "\"a\\\"b\\\\c\"") "a\"b\\c"))
(let ((data (read-json "{\"items\":[true,false,null,-1.25e+2,[],{}]}")))
  (assert (= 6 (length (gethash "items" data))))
  (assert (equal '(:number "-1.25e+2") (aref (gethash "items" data) 3))))
(dolist (bad '("[1,]" "{\"a\":}" "true false" "01" "1." "1e"
               "\"\\uD800\"" "\"\\uDC00\"" "\"\\x\""))
  (assert (rejects-json-p bad)))

;; JSON-LD must remain parseable and cannot close its enclosing script.
(let* ((text (format nil "</script>~%\"quoted\" \\ 長瀬"))
       (encoded (json-text (object "text" text))))
  (assert (not (search "</script>" encoded)))
  (assert (equal text (gethash "text" (read-json encoded)))))
(assert (equal (html-escape "<a href=\"x\">&'") "&lt;a href=&quot;x&quot;&gt;&amp;&#x27;"))

;; A repeat build must not duplicate sections or change output.
(let* ((files '("index.html" "about/index.html" "robots.txt" "sitemap.xml"))
       (before (mapcar #'read-file files)))
  (load (merge-pathnames "build-seo.lisp" *load-truename*))
  (assert (equal before (mapcar #'read-file files))))
(format t "PASS: JSON parsing, Unicode, escaping, and repeatable generation~%")
