Few TIP for configuring your web server

In demos and development the easiest way it to run the embedded join Html/Ajax adapter as in GpsdDummyDemo. But in deployment you would like your HTML
and Images to be serve from a real server. 

Because of CORS [Cross Origin Security] serving Ajax request and Javascript from a different http origin is not a good idea. Even if you succeed to run
it locally, many of your end-users will have security setup in such a way that in production it won't work. The only valid solution is to serve both
javascript and html from the same server, or to use JSONP profile.

The other issue you may face is than many places have firewall that prevent access to any non standard port. As a result if you choose to server
Ajax request from 4080 most of your users will fail to access it even with JsonP profile.

The only valid solution, serve everything from standard http:80 port. 

0) install your server pages and your gpstracking javascripts on two different directories. Example:

    ROOTDIR=/srv/www
    $ROOTDIR/gpsdtracking/javascript
    ROOTDIR/mywebsite/html
                     /images
                     /css

1) Run your HTTP/AJAX server on what ever port you want. This special port does not have to be visible from outside
     ROOTDIR=/srv/www/gpsdtracking
     PORT=4080

2) Configure your apache server in proxy mode only for javascript and ajax path. Integrate following line in your server config

    ProxyPass /javascripts  http://localhost:4080/javascripts
    ProxyPass /ajax         http://localhost:4080/ajax
    ProxyPassreverse        / http://localhost:4080

With this config any request to "/ajax" or "/javascripts" will be redirected to your Ajax server on localhost:4080. The ProxyPassreverse is necessary
to rewrite headers from responses coming from the Ajax server, in order proxyfication to be completely transparent to user browser.

Note: 

1) depending on your config you may want to serve only ajax or both ajax&javascript from your Ajax server. Gpsdtracking HTTP/AJAX server insert
at the beginning of every javascript a custom HTTP_AJAX_CONFIG object that allow application to select JSON/JsonP profile and to obtain an API_KEY.
If your HTTP server can provide those information, then you may choose to not to server javascript from AJAX server. 

2) if Gpsdtracking demo javascript do not find an HTTP_AJAX_CONFIG they will rollback to JsonP profile and will try to request AJAX from sinagot.net:4080
and will set API_KEY=123456789. This is typically the case when you load directly a page in a browser with file://
