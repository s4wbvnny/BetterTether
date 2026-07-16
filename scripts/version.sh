#!/bin/sh
# Prints the latest version from VERSIONS.md, used by the Makefile.
grep '^## v' VERSIONS.md | head -1 | awk '{print $2}'
