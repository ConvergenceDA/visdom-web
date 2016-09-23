# README #

This document will help you get started using the VISDOM analytics website code base.

### What is this repository for? ###

* It exposes feature data derived from interval meters via a fast and intuitive filtering, segmentation, and clustering interface.
* The visual components are delivered as a js app, with visual components rendered using the D3 library.
* The backend runs on Python, with CherryPy as the web server. It reads SQL query results or HDF5 or csv files containing tabular customer feature data into Pandas data frames, filters, sorts, and aggregates data to respond in JSON to RESTful data requests.

### How do I get set up? ###

* To run the app, you need to install a 64 bit version of Python 2.7.X, with all relevant supporting libraries. From there, users check out this source code, add their feature data to the `data` directory in a supported format (i.e. HDF5, csv, or SQLite) and edit `./data_cfg.py.template` into a non-versioned local `data_cfg.py` that points to their data files. When all is in place, the server is started via `python VISDOM-server.py`, which allows users to browse their features at http://localhost:8080.

### Quick start ###
```bash
$ git clone https://github.com/ConvergenceDA/visdom-web.git
$ cd visdom-web
$ conda install --file conda_reqs.txt
$ pip install -r pip_reqs.txt

# <copy your data files into the data folder>
# <modify data_cfg.py.template to data_cfg.py pointing at your data files>
# <update example_META.csv with the features and labels you want to use>

$ python VISDOM-server.py

# <browse in Chrome or Firefox to http://localhost:8080>
```

Here are line by line steps for getting started:

1. The Anaconda distribution of python (i.e. for scientific computing) is the easiest platform of python to configure for our purposes. Advanced users should feel free ot use the distribution of their choice. To install the minimal version of Anaconda, run the Python 2.7 64-bit installer from http://conda.pydata.org/miniconda.html. All the defaults in the install wizard are fine and you want it to add itself to your system path when asked. Note that if you have a pre-existing version of python installed, it will be earlier in your path and you will need to ensure that commands like `conda`, `pip`, and `python` below execute the new Anaconda versions of those files by either moving the Anaconda path entries earlier than the old version of python or by including the full path to your Anaconda installation every time you invoke those commands. Note that if you do not have administrative privileges on your machine that you can install Anaconda just for your user, which bypasses the need for administrative rights.

2. Clone the source into a directory named `visdom-web`. For the purposes of this description, we assume you cloned into `c:\dev\visdom-web` or `~/dev/visdom-web` on OSX/linux, but you can substitute your own path. Run `git clone https://github.com/ConvergenceDA/visdom-web.git` of for ssh users, run `git clone git@github.com:ConvergenceDA/visdom-web.git`.

3. Pull up a command prompt and change into the visdom-web directory (i.e. on windows type `cmd` into the windows start menu and hit return and type `cd c:\dev\visdom-web`) or open the console on OSX or linux and change into the relevant directory: `cd ~/dev/visdom-web`

4. At the command prompt, type `conda install --file conda_reqs.txt`. This will install the fancy matrix math and tabular data support for python as well as the web server support code.

5. At the command prompt, type `pip install -r pip_reqs.txt`. This will install a few other python libraries that we rely on.

6. Copy your data file(s) into `visdom-web/data`. See XXX TBD document on generating appropriate data files from R.

7. If you want to control which features are used by the web interface and what they are called (i.e. human readable names), create and reference a feature metadata csv. Note that `visdom-web/data/example_META.csv` provides a working example with most standard VISDOM features that you can modify.

8. Copy `visdom-web/data_cfg.py.template` to `visdom-web/data_cfg.py`. And edit it to point to your data files and metadata csv file (relative paths starting with `data` are fine). 

9. From the command line, which should still be at `visdom-web`, type `python VISDOM-server.py`. If it says 'ENGINE Serving on http://127.0.0.1:8080', you're set.

10. Go to http://localhost:8080 to browse your features.

Note that there may be platform specific errors, especially with HDF5 support that need to be worked through on a case by case basis.

See the wiki page [wiki/Installation](wiki/Installation) for more platform specific details.

### Who do I talk to? ###

* Contact sam@convergenceda.com with questions, comments or contributions.
