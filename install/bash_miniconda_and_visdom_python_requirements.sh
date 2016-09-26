#!/usr/bash

echo 'Downloading and installing miniconda'

# download latest miniconda for Python 2.X
if [ ! -e "Miniconda2-latest-Linux-x86_64.sh" ]
then
  mkdir ~/install
  cd ~/install
  echo "Miniconda distro not found downloading"
  wget https://repo.continuum.io/miniconda/Miniconda2-latest-Linux-x86_64.sh
fi

cd ~
# install miniconda
bash install/Miniconda2-latest-Linux-x86_64.sh -b

# add conda bin to PATH in ~/.bashrc
# note that this appends the line every time the script is run 
echo 'export PATH="~/miniconda2/bin:$PATH"\n' >> ~/.bashrc

# add it to the path for use by this script
export PATH="~/miniconda2/bin:$PATH"

read -n1 -rsp $'Press any key to continue or Ctrl-C to exit...\n'


echo 'installing conda and pip requirements'

cd ~/dev/visdom-web

conda install -y --file conda_reqs.txt
pip install -yr pip_reqs.txt

echo 'Now you need to copy your feature data and related metadata files into visdom-web/data'
echo 'and create your data_cfg.py based on those files.'
echo ''
echo 'When all is in place, you can run your server as:'
echo 'cd ~/dev/visdom-web'
echo 'python VISDOM-server.py'
