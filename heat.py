import os
import subprocess
from flask import Flask
from flask import render_template

app = Flask(__name__)

#@app.route("/")
#def hello():
#      return "Hello, World!"


@app.route("/")
def heat():
    page='<img src="heat_list.jpg">'
    page += '\n herp derp'
    heat_bits = parse_heat_bits(get_heat_bits())
    return render_template(
             'index.html',
             porta=heat_bits['PORTA'], portb=heat_bits['PORTB']
           )

def get_heat_bits():
    cmd = '../mccdaq/get_heat'
    completed = subprocess.run(cmd, stdout=subprocess.PIPE)
    out = completed.stdout.decode('utf-8')
    return out

def parse_heat_bits(mccdaq_out):
    ports_dict = {'PORTA':'', 'PORTB':''}
    for line in mccdaq_out.split('\n'):
        if line.startswith('PORTA'):
            ports_dict['PORTA'] = line
        if line.startswith('PORTB'):
            ports_dict['PORTB'] = line
    print(ports_dict)
    return ports_dict



if __name__ == "__main__":
      #app.run()
      port = os.environ.get('PORT', 8080)
      app.run(host='0.0.0.0', port=port, debug=True)
