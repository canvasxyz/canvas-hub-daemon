package main

import (
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"strings"
)

/**
* The general idea of this script is that we want a web server to listen to all requests on
* a particular port (8080), take the Fly-Forwarded-Port header and proxy the request
* to a web server running on localhost with the given port number
**/

type myHandler struct {}
func (h myHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// fmt.Printf()
	var ffp = r.Header["Fly-Forwarded-Port"]
	if(len(ffp) != 1) {
		// error
		print("No Fly-Forwarded-Port provided!\n")
		return
	}
	var port = strings.Trim(ffp[0], "\"")

	// r.URL is the parsed URL from the original request
	r.URL.Scheme = "http"
	// replace the host with the server's own host
	// and the port from Fly-Forwarded-Port
	r.URL.Host = fmt.Sprintf("localhost:%s", port)

	// try to create the new request object
	req, err := http.NewRequest(r.Method, fmt.Sprint(r.URL), r.Body)
	if(err != nil) {
		fmt.Printf("cannot create request object: %s\n", err)
		return
	}

	// send the request
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		fmt.Printf("client: request failed %s\n", err)
		return
	}

	// read the returned body data
	resBody, err := ioutil.ReadAll(res.Body)
	if err != nil {
		fmt.Printf("client: could not read response body: %s\n", err)
		return
	}

	// return the body data in the response
	w.Write(resBody)
}

func main() {
	var s = &http.Server{
		Addr: ":8080",
		Handler: myHandler{},
	}
	log.Fatal(s.ListenAndServe())
}
