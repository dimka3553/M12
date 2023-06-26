# Unsecure Filestore
This is a simple filestore that allows you to upload and download text files. Text is compressed using brotli, and stored in the filesystem on several storage servers.

## Usage
### Starting the server
1. navigate to the root directory of the project
2. run `docker-compose up --build`
3. import the insomnia workspace from `insomnia.json` into insomnia
4. try storing, retrieving, deleting and checking the size of files