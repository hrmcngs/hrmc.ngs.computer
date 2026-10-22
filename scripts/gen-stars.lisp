;;; Generate star counts without adding work to the browser.
(require :asdf)
(load (merge-pathnames "json.lisp" *load-truename*))
(defparameter *stars-root*
  (uiop:pathname-parent-directory-pathname
    (uiop:pathname-directory-pathname *load-truename*)))

(defun star-url (url)
  "Normalize supported project links; ignore queries, fragments and subpages."
  (when (stringp url)
    (let* ((start (cond ((uiop:string-prefix-p "https://" url) 8)
                        ((uiop:string-prefix-p "http://" url) 7)))
           (slash (and start (position #\/ url :start start))))
      (when slash
        (let* ((host (string-downcase (subseq url start slash)))
               (host (if (uiop:string-prefix-p "www." host) (subseq host 4) host))
               (end (or (position-if (lambda (c) (find c "?#")) url :start slash) (length url)))
               (parts (remove "" (uiop:split-string (subseq url slash end) :separator "/") :test #'equal))
               (n (cond ((equal host "github.com") 2) ((equal host "curseforge.com") 3))))
          (when (and n (>= (length parts) n))
            (let ((project (format nil "~{~A~^/~}" (subseq parts 0 n))))
              (when (and (= n 2) (uiop:string-suffix-p project ".git"))
                (setf project (subseq project 0 (- (length project) 4))))
              (format nil "https://~A/~A" host project))))))))

(defun collect-star-urls (content)
  (let ((seen (make-hash-table :test 'equal)) (urls nil))
    (dolist (items (list (gethash "works" content) (gethash "stats" content)
                        (gethash "build" (gethash "terminal" content (make-hash-table)))))
      (map nil (lambda (item)
                 (dolist (link (cons (gethash "url" item) (coerce (gethash "links" item) 'list)))
                   (let ((url (star-url link)))
                     (when (and url (not (gethash url seen)))
                       (setf (gethash url seen) t)
                       (push url urls))))) items))
    (nreverse urls)))

(defun star-count-p (entry)
  (let ((n (and (hash-table-p entry) (gethash "count" entry))))
    (and (hash-table-p entry)
         (or (not (equal (gethash "platform" entry) "CurseForge"))
             (equal (gethash "metric" entry) "favorites"))
         (consp n) (eq (first n) :number)
         (let ((text (second n)))
           (and (plusp (length text)) (every #'digit-char-p text)
                (<= (parse-integer text) 9007199254740991))))))

(defun merge-star-entries (urls live previous)
  (let ((entries (make-hash-table :test 'equal)))
    (dolist (url urls entries)
      (let ((new (gethash url live)) (old (gethash url previous)))
        ;; Stars can decrease. Only fall back when the live metric is unavailable.
        (cond ((star-count-p new) (setf (gethash url entries) new))
              ((star-count-p old) (setf (gethash url entries) old)))))))

(defun generate-stars ()
  (let* ((output (merge-pathnames "charts/stars.json" *stars-root*))
         (content (read-json (uiop:read-file-string (merge-pathnames "content.json" *stars-root*))))
         (previous (handler-case (read-json (uiop:read-file-string output))
                     (error () (object "entries" (make-hash-table :test 'equal)))))
         (urls (collect-star-urls content))
         (live (read-json (uiop:run-program
                 (append (list "node" (namestring (merge-pathnames "scripts/gen-stars.js" *stars-root*)) "--fetch") urls)
                 :output :string :error-output *error-output*)))
         (entries (merge-star-entries urls live (gethash "entries" previous)))
         (encoded (json-text entries)))
    (unless (and (probe-file output) (equal encoded (json-text (gethash "entries" previous))))
      (multiple-value-bind (sec min hour day month year) (decode-universal-time (get-universal-time) 0)
        (with-open-file (out output :direction :output :if-exists :supersede :external-format :utf-8)
          ;; Numeric literals were validated by read-json; preserve them on output.
          (write-line (json-text (object "generated"
            (format nil "~4,'0D-~2,'0D-~2,'0DT~2,'0D:~2,'0D:~2,'0DZ" year month day hour min sec)
            "entries" entries)) out))))))

(unless (member :stars-test *features*) (generate-stars))
