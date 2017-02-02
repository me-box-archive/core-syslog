# databox-logstore
A basic version of the databox datastore access log aggregator  

# API

All request to the logstore must be authenticated with a macaroon

    URL: /<datastore>
    Method: POST
    Parameters: none
    Notes: Raw JSON body containing the event to be logged (anything accepted for now) 

    URL: /<datastore>
    Method: GET
    Parameters: none
    Notes: returns a JSON array of logged activities 