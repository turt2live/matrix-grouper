const cmdLineArgs = require("command-line-args");
const cmdLineUsage = require("command-line-usage");
const jsYaml = require("js-yaml");
const fs = require("fs");
const grouper = require("./src/grouper");

const optionDefinitions = [
    {
        name: "help",
        alias: "h",
        type: Boolean,
        description: "Display this menu",
    },
    {
        name: "registration",
        alias: "r",
        type: String,
        description: "The appservice registration file to read",
        typeLabel: "<appservice-whatever.yaml>",
    },
    {
        name: "homeserver",
        alias: "c",
        type: String,
        description: "The homeserver configuration file",
        typeLabel: "<homeserver.yaml>",
    },
    {
        name: "group",
        alias: "g",
        type: String,
        description: "The group to add users to",
        typeLabel: "<+group:domain.com>",
    },
    {
        name: "domain",
        alias: "d",
        type: String,
        description: "The domain that suffixes all IDs.",
        typeLabel: "<domain.com>",
    },
    {
        name: "csapi",
        alias: "a",
        type: String,
        description: "The base URL to use for client/server API interaction. Default: http://localhost:8008",
        defaultValue: "http://localhost:8008",
        typeLabel: "<http://localhost:8008>",
    },
    {
        name: "userprefix",
        alias: "u",
        type: String,
        description: "The user prefix to group on. Required if the script cannot determine what the prefix is.",
        typeLabel: "<@_bridged>",
    },
    {
        name: "skip-users",
        type: Boolean,
        description: "If set, the script will not group users (default false)",
        defaultValue: false,
    },
    {
        name: "skip-rooms",
        type: Boolean,
        description: "If set, the script will not relate groups in rooms (default false)",
        defaultValue: false,
    },
    {
        name: "vacate",
        type: Boolean,
        description: "If set, causes the group to be vacated instead",
        defaultValue: false,
    }
];

const options = cmdLineArgs(optionDefinitions);

if (options.help) {
    console.log(cmdLineUsage([
        {
            header: "Matrix Bridge Grouper",
            content: "Groups your bridged users on demand.",
        },
        {
            header: "Options",
            optionList: optionDefinitions,
        },
    ]));
    process.exit(0);
}

if (!options.registration || !options.homeserver || !options.group || !options.domain) {
    console.log("Missing registration, homeserver, domain, or group. Please see -h");
    process.exit(1);
}

// Try parsing the configuration to get a better picture of the state of things
const homeserverConfig = jsYaml.safeLoad(fs.readFileSync(options.homeserver), 'utf8');
const appserviceConfig = jsYaml.safeLoad(fs.readFileSync(options.registration), 'utf8');

if (!homeserverConfig || !homeserverConfig.database || homeserverConfig.database.name !== "psycopg2") {
    console.log("Synapse database must be postgresql (psycopg2)");
    process.exit(2);
}

console.log("Running Matrix Grouper...");
grouper({
    hsConfig: homeserverConfig,
    appserviceConfig: appserviceConfig,
    groupId: options.group,
    csApiUrl: options.csapi,
    domain: options.domain,
    skipUsers: options['skip-users'],
    skipRooms: options['skip-rooms'],
    usersPrefix: options.userprefix,
    vacate: options.vacate,
});