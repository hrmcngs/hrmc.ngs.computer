;;; Generate static profile HTML with SBCL; no external libraries required.
(require :asdf)
(defparameter *root* (uiop:pathname-parent-directory-pathname
                      (uiop:pathname-directory-pathname *load-truename*)))

(load (merge-pathnames "json.lisp" *load-truename*))

(defun html-escape (text)
  (with-output-to-string (out)
    (loop for c across text do
      (write-string (case c (#\& "&amp;") (#\< "&lt;") (#\> "&gt;")
                         (#\" "&quot;") (#\' "&#x27;") (otherwise (string c))) out))))
(defun join-text (strings separator)
  (format nil "~{~A~}" (loop for s in strings for first = t then nil
                              unless first collect separator collect s)))
(defun replace-between (html start end value)
  (let* ((a (search start html))
         (b (and a (search end html :start2 (+ a (length start))))))
    (unless (and a b (not (search start html :start2 (+ a (length start)))))
      (error "Expected one complete block: ~A" start))
    (concatenate 'string (subseq html 0 (+ a (length start))) value (subseq html b))))
(defun block-html (html key value)
  (replace-between html (format nil "<!-- generated:~A -->" key)
                   (format nil "<!-- /generated:~A -->" key) (format nil "~%~A~%" value)))
(defun field-html (html id value)
  (let* ((marker (format nil "id=\"~A\"" id)) (at (search marker html)))
    (unless at (error "Missing field ~A" id))
    (let* ((start (position #\< html :end at :from-end t))
           (tag-end (position #\Space html :start start))
           (open-end (position #\> html :start at))
           (tag (subseq html (1+ start) tag-end)))
      (replace-between html (subseq html start (1+ open-end)) (format nil "</~A>" tag) value))))
(defun read-file (name) (uiop:read-file-string (merge-pathnames name *root*) :external-format :utf-8))
(defun write-file (name text)
  (with-open-file (out (merge-pathnames name *root*) :direction :output
                       :if-exists :supersede :external-format :utf-8)
    (write-string text out)))
(defun get-in (data &rest keys) (reduce (lambda (obj key) (gethash key obj)) keys :initial-value data))

(let* ((content (read-json (read-file "content.json")))
       (identity (gethash "identity" content))
       (social (coerce (get-in content "terminal" "socialLinks") 'list))
       (base (gethash "url" identity))
       (person (object "@type" "Person" "@id" (concatenate 'string base "#person")
                       "name" (gethash "name" identity) "alternateName" (gethash "alternateNames" identity)
                       "url" base "description" (gethash "description" identity)
                       "sameAs" (coerce (remove-duplicates
                         (loop for link in social unless (equal (gethash "identity" link) "related")
                               collect (gethash "url" link)) :test #'equal :from-end t) 'vector))))
  (dolist (link social)
    (let ((url (gethash "url" link)))
      (unless (or (uiop:string-prefix-p "https://" url) (uiop:string-prefix-p "http://" url))
        (error "Invalid profile URL: ~A" url))))
  (dolist (page '("index.html" "about/index.html"))
    (let* ((home (equal page "index.html")) (html (read-file page))
           (url (if home base (concatenate 'string base "about/")))
           (title (format nil "~A~A（ながせひろみち / hiromichi-ngs）| hrmc.ngs.computer"
                          (if home "" "About | ") (gethash "name" identity)))
           (structured (object "@context" "https://schema.org" "@type" "ProfilePage"
                               "@id" (concatenate 'string url "#profile") "url" url "name" title "mainEntity" person)))
      (setf html (replace-between html "<title>" "</title>" (html-escape title)))
      (setf html (block-html html "seo"
        (with-output-to-string (out)
          (format out "  <meta name=\"~A\" content=\"~A\">~%" "description" (html-escape (gethash "description" identity)))
          (format out "  <link rel=\"~A\" href=\"~A\">~%" "canonical" (html-escape url))
          (loop for (key value) in (list (list "og:type" "profile") (list "og:title" title)
                                        (list "og:description" (gethash "description" identity)) (list "og:url" url))
                do (format out "  <meta property=\"~A\" content=\"~A\">~%" key (html-escape value)))
          (format out "  <script type=\"~A\">~%~A~%  </script>" "application/ld+json" (json-text structured)))))
      (setf html (block-html html "identity"
        (format nil "<p class=\"~A\">~A（~A）<br>Web・Minecraft Modを制作しています。</p>"
                "profile-aliases" (html-escape (gethash "name" identity))
                (html-escape (join-text (coerce (gethash "alternateNames" identity) 'list) " / ")))))
      (if home
          (progn
            (dolist (key '("tag" "title" "sub"))
              (setf html (field-html html (concatenate 'string "hero-" key) (html-escape (get-in content "hero" key)))))
            (setf html (field-html html "links-group-name" (html-escape (get-in content "links" "groupName"))))
            (setf html (field-html html "links-notice" (html-escape (get-in content "links" "notice")))))
          (progn
            (dolist (key '("label" "name" "handle"))
              (setf html (field-html html (concatenate 'string "profile-" key) (html-escape (get-in content "profile" key)))))
            (setf html (field-html html "profile-bio" (join-text (map 'list #'html-escape (get-in content "profile" "bio")) "<br>")))))
      (setf html (block-html html "social"
        (with-output-to-string (out)
          (write-line (if home "<div class=\"links-row\" id=\"links-row\">" "<nav aria-label=\"SNS・関連プロフィール\"><ul>") out)
          (dolist (link social)
            (let ((related (equal (gethash "identity" link) "related"))
                  (href (html-escape (gethash "url" link))) (label (html-escape (gethash "label" link))))
              (if home
                  (format out "<a class=\"~A\" href=\"~A\" target=\"~A\" rel=\"~A\">~A</a>~%" "link-card" href "_blank"
                          (if related "noopener noreferrer" "me noopener noreferrer") label)
                  (format out "<li><a href=\"~A\"~A>~A</a></li>~%" href (if related "" " rel=\"me\"") label))))
          (write-string (if home "</div>" "</ul></nav>") out))))
      (write-file page html)))
  (write-file "robots.txt" (format nil "User-agent: *~%Allow: /~%~%Sitemap: ~Asitemap.xml~%" base))
  (write-file "sitemap.xml"
    (with-output-to-string (out)
      (write-line "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" out)
      (write-line "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">" out)
      (dolist (suffix '("" "about/" "photos/" "items/"))
        (format out "  <url><loc>~A</loc></url>~%" (html-escape (concatenate 'string base suffix))))
      (write-line "</urlset>" out))))
(format t "Generated profile HTML, robots.txt, and sitemap.xml~%")
