import assert from 'assert'
import { join } from 'path'
import { lstat, readdir, readFile } from 'fs'
import glob from 'glob'
import { forEachParallel } from 'vasync'

let globOpts =  { nosort: true
                , nocomment: true
                , nonegate: true
                , silent: true
                }

// for EMFILE handling
let timeout = 0

const isWindows = process.platform === 'win32'

/** Returns a object with sync and async methods from fs or overrides. */
const defaults = options => {
  let methods = [ 'unlink'
                , 'chmod'
                , 'stat'
                , 'lstat'
                , 'rmdir'
                , 'readdir'
                ]
  methods.forEach(m => {
    options[m] = options[m] || fs[m]
    m = m + 'Sync'
    options[m] = options[m] || fs[m]
  })

  options.maxBusyTries = options.maxBusyTries || 3
  options.emfileWait = options.emfileWait || 1000
}


/** Map dependencies object to a map of names to versions */
const getDepVersionMap = (dependencies = {}) => Object.keys(dependencies).map(name => [name, dependencies[name]])

const getDepMap = ({ dependencies, devDependencies, peerDependencies, optionalDependencies }) => {
  return new Map( [ ['dependencies', getDepVersionMap(dependencies)]
                  , ['devDependencies', getDepVersionMap(devDependencies)]
                  , ['peerDependencies', getDepVersionMap(peerDependencies)]
                  , ['optionalDependencies', getDepVersionMap(optionalDependencies)]
                  ])
}

/** NOT RECURSIVE ENOUGH... */
const flattenOnProp = (obj, name, prop) => {
  let result = []
  let node = obj[name]
  let value = obj[prop]
  while(node) {
    result.add(value)
    node = node[name]
    value = node[prop]
  }
  return result
}

const readPackage = dir => {
  let packageStats =  { packageDir: dir
                      , packageJsonPath: join(dir, 'package.json')
                      , nodeModulesDir: join(dir, 'node_modules')
                      , hasNodeModules: null
                      , isCorrupt: null
                      , depMap: null
                      , childPackageStats: null

                      , isCorrupt: false
                      }

  const getRecursiveMap = (obj, name, prop) => new Map(flattenOnProp(obj, name, prop)) 'childPackageStats', 'depMap'))
  const aggregator =  { get recursiveDepMap() {
                          return getRecursiveMap(packageStats, 'childPackageStats')
                        }
                      , get physicalDeps() {
                          let physicalSet = new Set()
                        }
                      , get deps() {
                        }
                      , get devDeps() {

                        }
                      , get peerDeps() {

                        }
                      , get optionalDeps() {

                        }
                      , get logicalDeps() {

                        }
                    }
  const { packageJsonPath, nodeModulesDir } = packageStats
  return new Promise((resolve, reject) => {
    lstat(packageJsonPath, (err, stats) => {
      if(err)
        return reject(err)
      if(!stats.isFile())
        return resolve(Object.assign({}, packageStats, { isCorrupt: true }))
      readFile(packageJsonPath, 'utf8', (err, packageJson) => {
        if(err)
          return reject(err)
        const packageObj = JSON.parse(packageJson)
        const depMap = getDepMap(packageObj)

        readdir(nodeModulesDir, (err, children) => {
          if(err)
            return resolve(Object.assign({}, packageStats, { depMap, hasNodeModules: false, aggregator }))
          Promise.all(children.filter(x => x !== '.bin').map(x => npmCleanup({ dir: join(nodeModulesDir, x), isMain: false, aggregator })))
            .then(childPackageStats => {
              resolve(Object.assign({}, packageStats, { depMap, childPackageStats, hasNodeModules: true, aggregator }))
            })
            .catch(err => {
              reject(err)
            })
        })
      })
    })
  })
}
/** Get stats on the path */
/** 1) path is directory => check for package.json
      =>  no package.json exists => exists in package.json?
              - exists in dependencies => restore latest main package.json dependency version
              - doesnt exist in dependency => delete entire directory
      =>  package.json exists => npmCleanup(<package <node_modules> folder)


          => Verify package has all the dependencies it needs to run or warn if not

    2) Path is file (not package.json) => delete it, should only be hitting 3 files (package directory, node_modules directory, package.json)
**/
export default function npmCleanup ({ dir, isMain = true }) {
  assert.ok(dir, 'npm-cleanup: missing path')
  assert.equal(typeof dir, 'string', 'npm-cleanup: path should be a string')

  return readPackage(dir)
    .then(packageStats => {
      if(!isMain)
        return packageStats
      return packageStats
    })
    .catch(err => {
      throw err
    })

}
// Two possible strategies.
// 1. Assume it's a file.  unlink it, then do the dir stuff on EPERM or EISDIR
// 2. Assume it's a directory.  readdir, then do the file stuff on ENOTDIR
//
// Both result in an extra syscall when you guess wrong.  However, there
// are likely far more normal files in the world than directories.  This
// is based on the assumption that a the average number of files per
// directory is >= 1.
//
// If anyone ever complains about this, then I guess the strategy could
// be made configurable somehow.  But until then, YAGNI.

/*
function rimraf_ (p, options, cb) {
  assert(p)
  assert(options)
  assert(typeof cb === 'function')

  // sunos lets the root user unlink directories, which is... weird.
  // so we have to lstat here and make sure it's not a dir.
  options.lstat(p, function (er, st) {
    if (er && er.code === "ENOENT")
      return cb(null)

    if (st && st.isDirectory())
      return rmdir(p, options, er, cb)

    options.unlink(p, function (er) {
      if (er) {
        if (er.code === "ENOENT")
          return cb(null)
        if (er.code === "EPERM")
          return (isWindows)
            ? fixWinEPERM(p, options, er, cb)
            : rmdir(p, options, er, cb)
        if (er.code === "EISDIR")
          return rmdir(p, options, er, cb)
      }
      return cb(er)
    })
  })
}

function fixWinEPERM (p, options, er, cb) {
  assert(p)
  assert(options)
  assert(typeof cb === 'function')
  if (er)
    assert(er instanceof Error)

  options.chmod(p, 666, function (er2) {
    if (er2)
      cb(er2.code === "ENOENT" ? null : er)
    else
      options.stat(p, function(er3, stats) {
        if (er3)
          cb(er3.code === "ENOENT" ? null : er)
        else if (stats.isDirectory())
          rmdir(p, options, er, cb)
        else
          options.unlink(p, cb)
      })
  })
}

function fixWinEPERMSync (p, options, er) {
  assert(p)
  assert(options)
  if (er)
    assert(er instanceof Error)

  try {
    options.chmodSync(p, 666)
  } catch (er2) {
    if (er2.code === "ENOENT")
      return
    else
      throw er
  }

  try {
    var stats = options.statSync(p)
  } catch (er3) {
    if (er3.code === "ENOENT")
      return
    else
      throw er
  }

  if (stats.isDirectory())
    rmdirSync(p, options, er)
  else
    options.unlinkSync(p)
}

function rmdir (p, options, originalEr, cb) {
  assert(p)
  assert(options)
  if (originalEr)
    assert(originalEr instanceof Error)
  assert(typeof cb === 'function')

  // try to rmdir first, and only readdir on ENOTEMPTY or EEXIST (SunOS)
  // if we guessed wrong, and it's not a directory, then
  // raise the original error.
  options.rmdir(p, function (er) {
    if (er && (er.code === "ENOTEMPTY" || er.code === "EEXIST" || er.code === "EPERM"))
      rmkids(p, options, cb)
    else if (er && er.code === "ENOTDIR")
      cb(originalEr)
    else
      cb(er)
  })
}

function rmkids(p, options, cb) {
  assert(p)
  assert(options)
  assert(typeof cb === 'function')

  options.readdir(p, function (er, files) {
    if (er)
      return cb(er)
    var n = files.length
    if (n === 0)
      return options.rmdir(p, cb)
    var errState
    files.forEach(function (f) {
      rimraf(join(p, f), options, function (er) {
        if (errState)
          return
        if (er)
          return cb(errState = er)
        if (--n === 0)
          options.rmdir(p, cb)
      })
    })
  })
}

// this looks simpler, and is strictly *faster*, but will
// tie up the JavaScript thread and fail on excessively
// deep directory trees.
function rimrafSync (p, options) {
  options = options || {}
  defaults(options)

  assert(p, 'rimraf: missing path')
  assert.equal(typeof p, 'string', 'rimraf: path should be a string')
  assert(options, 'rimraf: missing options')
  assert.equal(typeof options, 'object', 'rimraf: options should be object')

  var results

  if (options.disableGlob || !glob.hasMagic(p)) {
    results = [p]
  } else {
    try {
      fs.lstatSync(p)
      results = [p]
    } catch (er) {
      results = glob.sync(p, globOpts)
    }
  }

  if (!results.length)
    return

  for (var i = 0; i < results.length; i++) {
    var p = results[i]

    try {
      var st = options.lstatSync(p)
    } catch (er) {
      if (er.code === "ENOENT")
        return
    }

    try {
      // sunos lets the root user unlink directories, which is... weird.
      if (st && st.isDirectory())
        rmdirSync(p, options, null)
      else
        options.unlinkSync(p)
    } catch (er) {
      if (er.code === "ENOENT")
        return
      if (er.code === "EPERM")
        return isWindows ? fixWinEPERMSync(p, options, er) : rmdirSync(p, options, er)
      if (er.code !== "EISDIR")
        throw er
      rmdirSync(p, options, er)
    }
  }
}

function rmdirSync (p, options, originalEr) {
  assert(p)
  assert(options)
  if (originalEr)
    assert(originalEr instanceof Error)

  try {
    options.rmdirSync(p)
  } catch (er) {
    if (er.code === "ENOENT")
      return
    if (er.code === "ENOTDIR")
      throw originalEr
    if (er.code === "ENOTEMPTY" || er.code === "EEXIST" || er.code === "EPERM")
      rmkidsSync(p, options)
  }
}

function rmkidsSync (p, options) {
  assert(p)
  assert(options)
  options.readdirSync(p).forEach(function (f) {
    rimrafSync(join(p, f), options)
  })
  options.rmdirSync(p, options)
}
*/
