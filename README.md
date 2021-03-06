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
$ conda install -y --file conda_reqs.txt
$ pip install -r pip_reqs.txt

# <copy your data files into the data folder>
# <modify data_cfg.py.template to data_cfg.py pointing at your data files>
# <update example_META.csv with the features and labels you want to use>

$ python VISDOM-server.py

# <browse in Chrome or Firefox to http://localhost:8080>
```

Here are line by line steps for getting started:

1. The Anaconda distribution of python (i.e. for scientific computing) is the easiest platform of python to configure for our purposes. Advanced users should feel free ot use the distribution of their choice. To install the minimal version of Anaconda, run the Python 2.7 64-bit installer from [http://conda.pydata.org/miniconda.html](http://conda.pydata.org/miniconda.html). Full install instructions are available at [http://conda.pydata.org/docs/install/quick.html](http://conda.pydata.org/docs/install/quick.html). All the defaults in the install wizard are fine and you want it to add itself to your system path when asked. *Note:* if you have a pre-existing version of python installed, it will be earlier in your path and you will need to ensure that commands like `conda`, `pip`, and `python` below execute the new Anaconda versions of those files by either moving the Anaconda path entries earlier than the old version of python or by including the full path to your Anaconda installation every time you invoke those commands. Note that if you do not have administrative privileges on your machine that you can install Anaconda just for your user, which bypasses the need for administrative rights.

2. Clone the source into a directory named `visdom-web`. For the purposes of this description, we assume you cloned into `c:\dev\visdom-web` or `~/dev/visdom-web` on OSX/linux, but you can substitute your own path. Run 
  ```bash
  git clone https://github.com/ConvergenceDA/visdom-web.git
  #or for ssh users, run 
  git clone git@github.com:ConvergenceDA/visdom-web.git
  ```

3. Pull up a command prompt and change into the visdom-web directory (i.e. on windows type `cmd` into the windows start menu and hit return and type `cd c:\dev\visdom-web`) or open the console on OSX or linux and change into the relevant directory: 
  ```bash
  cd ~/dev/visdom-web
  ```

4. Run `conda install` and `pip install` commands to install the Python module requirements for VISDOM-web. Conda will install Numpy, Pandas, support for various tabular data and database data formats and the CherryPy web server support modules. Pip will install a couple of miscellaneous packages.

  ```bash
  conda install -y --file conda_reqs.txt
  pip install -r pip_reqs.txt
  ```

5. Copy your data file(s) into `visdom-web/data`. See the companion project http://github.com/convergenceda/visdom/ and specifically, https://github.com/ConvergenceDA/visdom/blob/master/vignettes/example_feature_extraction.rmd for the details on computing customer features and exporting data files from R.

6. If you want to control which features are used by the web interface and what they are called (i.e. human readable names), create and reference a feature metadata csv. Note that `visdom-web/data/example_META.csv` provides a working example with most standard VISDOM features that you can modify. The META file has the following format:

  |variable|formula|group|units|type|label|
  |--------|-------|-----|-----|----|-----|
  |zip5||1.geography||category|5 digit zip code|
  |nObs||7.meta|count|int|# of electricity observations|
  |kw_mean||2.consumption|kW|float|mean demand (all obs)|
  |toutC|(tout - 32) * 5/9|6.weather|deg C|float|Annual mean outside temperature|
  
  The fields are used as follows
  
  * `variable` The name of the varialbe as found in the data table. These are the same as the names of the columns from the R data frame they are derived from, except that the export code cleans up dots and other punctuation, making them all underscores.
  * `formula` An optional field for defining a 'meta variable' using a simple formula composed of other variable names. It is used in a Pandas `df.eval()` to define the new variable values, so look to Pandas documentation for capabilites and limitations.
  * `group` The named group that the feature should be a a part of. If the group name starts with a number and dot, as in `1.geography`, the number is parsed to determine the order of the groups in the web-based menues of features found in the web interface.
  * `units` Optional field for the display units to use when presenting the feature, i.e. kW, etc. in figures in the web interface.
  * `type` The data type of the feature. One of `int`, `float`, or `category`. Some visuals only work with numerical or category data and the visual filters for numerical data are presented as histograms while categorical data is presented as a multi-select.
  * `label` The human readable label for the feature used in menus throughout the web tool.

7. Copy `visdom-web/data_cfg.py.template` to `visdom-web/data_cfg.py`. And edit it to point to your data files and metadata csv file (relative paths starting with `data` are fine). Entries in the data_cfg.py look like this:

  ```python
  sources = {
      # Sample basic features
      'basics'          : { 'label'          : 'Basic data features', 
                            'public'         : True, 
                            'prefix'         : 'basics',
                            'dataFormat'     : 'csv',    
                            'dataIdentifier' : 'data/basic_features.csv',  
                            'colMetaFile'    : 'data/basic_features_META.csv'},
    }
  ```

  The config file is a python file that contains a dict names `sources`. Each entry in this dict corresponds to a table of data (i.e. data that is loaded into a Pandas DataFrame) that can be referenced and accessed via the web interface. Although the example file contains only one entry, you can define multiple entries and these will be used to populate a list of available data sources in the web interface (if public). 

  * Data source name, `basics` in this case is the key in the python dict that contains the configuration information for the data. It is also the name of the data source in the RESTful data interface and will thus be found in urls related to the configured data.
  * `label` The human readable label for the configured data table, used in html option/select menus to describe the data, so should be kept as short as possible.
  * `public` A boolean that indicates whether the data table should be available in the menu of avalaible data sources in the web interface. Data that supports custom functionality, like load shape or demand response event outcome data, can be made available to the applicaiton for internal use without public listing.
  * `prefix` The naming convention prefix used to associate the configured dat atable with other associated custom data tables. The most prominent usage for this field is, again, load shape data that is associated with the configured feature data.
  * `dataFormat` One of `csv`, `hdf`, or `sqlite`, specifying the format of the resource (i.e. file or database table) pointed to by the `dataIdentifier`
  * `dataIdentifier` Path to the data file or database that contains the feature data being configured.
  * `colMetaFile` Metadata csv file that contains human readable labels, data types, units, and menu grouping for each feature found in the feature data. Any features not listed in the META file will not be displayed in the web interface, so it can be used to edit the list of avaialble feautures.
  * `dataTable` Optional additional identifier used to locate the feature data table by name in data formats that have multiple tables (i.e. hdf5 and databases).

8. From the command line, which should still be at `visdom-web`, type `python VISDOM-server.py`. If it says 'ENGINE Serving on http://127.0.0.1:8080', you're set.

9. Go to http://localhost:8080 to browse your features.

Note that there may be platform specific errors, especially with HDF5 support that need to be worked through on a case by case basis.

See the wiki page [wiki/Installation](wiki/Installation) for more platform specific details.

### Who do I talk to? ###

* Contact sam@convergenceda.com with questions, comments or contributions.
