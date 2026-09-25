import json, sys, time, urllib.request
B="https://api.ibb.gov.tr/MetroIstanbul/api/MetroMobile/V2/"
def post(ep, body, tries=10):
    for i in range(tries):
        try:
            req=urllib.request.Request(B+ep, data=json.dumps(body).encode(), headers={"Content-Type":"application/json","User-Agent":"Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                t=r.read().decode()
                return t
        except Exception as e:
            time.sleep(1.5)
    return None
if __name__=="__main__":
    ep=sys.argv[1]; body=json.loads(sys.argv[2])
    t=post(ep, body); print(ep, sys.argv[2], "=>", (t or "FAIL")[:int(sys.argv[3]) if len(sys.argv)>3 else 500])
