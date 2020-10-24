#!/usr/bin/env jssh

// 在没有jssh的情况下，将第一行改为以下内容：
// #!/usr/bin/env go run github.com/leizongmin/jssh

const packageName = `github.com/leizongmin/jssh`;
const binName = `jssh`;
const goBuild = `go build -v -ldflags "-s -w"`;
const goProxy = `https://goproxy.cn`;

const unameOutput = sh.exec(`uname -a`, {}, 1).output;
const releaseDir = path.join(__dirname, `release`);
const cacheDir = path.join(releaseDir, `cross_compile_cache`);

const goVersionOutput = sh
  .exec(`go version`, {}, 2)
  .output.match(/go version go(.*) /);
if (!goVersionOutput) {
  log.error(`无法通过命令[go version]获得Go版本号`);
  exit(1);
}
const goVersion = goVersionOutput[1];
log.info(`当前Go版本号%s`, goVersion);

// 如果执行命令时指定 --release 则更新版本号信息
if (cli.bool(`release`)) {
  updateReleasePkgInfo();
}

sh.setenv(`GO111MODULE`, `on`);
sh.setenv(`GOPROXY`, goProxy);

sh.exec(`mkdir -p ${releaseDir}`);
fs.readdir(releaseDir).forEach((s) => {
  const p = path.join(releaseDir, s.name);
  if (p !== cacheDir) {
    sh.exec(`rm -rf ${p}`);
  }
});

buildHostOSVersion();

if (unameOutput.includes(`Darwin`)) {
  buildLinuxVersionOnDocker();
}

buildReleaseFiles();

function updateReleasePkgInfo() {
  log.info(`更新版本信息`);
  const date = sh.exec(`date +%Y%m%d%H%M`, {}, 2).output.trim();
  const commit = sh.exec(`git rev-parse --short HEAD`, {}, 2).output.trim();
  if (!date || !commit) {
    log.error(`无法获取date和commit信息`);
    exit(1);
  }
  const pkginfoFile = path.join(__dirname, `internal/pkginfo/pkginfo.go`);
  const data = fs.readfile(pkginfoFile);
  const newData = data
    .replaceAll(/build-[1,2][0-9]*/g, `build-${date}`)
    .replaceAll(/commit-[0-9a-f]*/g, `commit-${commit}`)
    .replaceAll(/go\d+\.\d+\.\d+/g, `go${goVersion}`);
  fs.writefile(pkginfoFile, newData);
  log.info(newData);
}

function buildHostOSVersion() {
  log.info(`构建宿主系统版本`);
  let type = `other`;
  if (unameOutput.includes(`Darwin`)) {
    type = `osx`;
  } else if (unameOutput.includes(`Linux`)) {
    type = `linux`;
  }
  const binPath = path.join(releaseDir, type, binName);
  sh.exec(`${goBuild} -o ${binPath} ${packageName}`);
  log.info(`构建输出到%s`, binPath);
}

function buildLinuxVersionOnDocker() {
  if (sh.exec(`which docker`).code !== 0) {
    log.info(`未安装Docker，无法构建Linux版本`);
    return;
  }
  log.info(`在macOS上通过Docker构建Linux版本`);
  const binPath = path.join(releaseDir, `linux`, binName);
  sh.exec(`mkdir -p ${cacheDir}`);
  const ret = sh.exec(
    `docker run --rm -it -v "${cacheDir}:/go" -v ${__dirname}:${__dirname} -w ${__dirname} -e GO111MODULE=on -e GOPROXY=${goProxy} golang:${goVersion} ${goBuild} -o ${binPath} ${packageName}`
  );
  if (ret.code !== 0) {
    log.error(`通过Docker构建失败`);
  }
}

function buildReleaseFiles() {
  log.info(`输出发布压缩包`);
  const dtsFile = path.join(__dirname, `jssh.d.ts`);
  fs.readdir(releaseDir).forEach((s) => {
    if (s.name.startsWith(`.`)) return;
    const p = path.join(releaseDir, s.name);
    if (p !== cacheDir) {
      sh.cd(__dirname);
      sh.exec(`cp -f ${dtsFile} ${p}`);
      sh.cd(p);
      const tarFile = path.join(releaseDir, `${binName}-${s.name}`);
      sh.exec(`tar -czvf ${tarFile}.tar.gz *`);
      sh.cd(__dirname);
      log.info(`输出压缩包%s`, tarFile);
    }
  });
}
