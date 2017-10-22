const AppServiceRegistration = require("matrix-appservice-bridge").AppServiceRegistration;
const ClientFactory = require("matrix-appservice-bridge").ClientFactory;
const Promise = require("bluebird");
const PGClient = require("pg").Client;

let homeserverConfig = null;
let registration = null;
let hsDomain = null;

let factory = null;
let botClient = null;
let db = null;

module.exports = (opts) => {
    homeserverConfig = opts.hsConfig;
    registration = AppServiceRegistration.fromObject(opts.appserviceConfig);
    hsDomain = opts.domain;

    if (!opts.groupId.endsWith(":" + opts.domain)) {
        throw new Error("Group ID must be local to the homeserver");
    }

    // Set up the client factory
    factory = new ClientFactory({
        appServiceUserId: "@" + registration.sender_localpart + ":" + hsDomain,
        token: registration.as_token,
        url: opts.csApiUrl,
    });
    botClient = factory.getClientAs(null);

    // Set up the database
    console.log("Connecting to database...");
    db = new PGClient({
        user: homeserverConfig.database.args.user,
        host: homeserverConfig.database.args.host,
        database: homeserverConfig.database.args.database,
        password: homeserverConfig.database.args.password,
    });

    db.connect().then(() => {
        // Figure out the user prefix
        let usersPrefix = opts.usersPrefix;
        if (!usersPrefix) {
            if (registration.namespaces && registration.namespaces.users && registration.namespaces.users.length > 0) {
                let regex = registration.namespaces.users[0].regex;
                if (regex.endsWith(".*")) usersPrefix = regex.substring(0, regex.length - 2);
                else throw new Error("Cannot determine prefix for users: Unrecognized regex");
            } else throw new Error("Cannot determine prefix for users: Missing configuration in registration");
        }

        let chain = checkGroupExists(opts.groupId);

        let beforeGroupingUserCount = 0;
        let afterGroupingUserCount = 0;
        let usersFailedGrouping = [];
        let roomsFailedAssociation = [];

        if (!opts.skipUsers) {
            chain = chain.then(() => getGroupedUserCount(opts.groupId, usersPrefix))
                .then(count => beforeGroupingUserCount = count)
                .then(() => getUngroupedUsers(opts.groupId, usersPrefix))
                .then(users => {
                    let chain = Promise.resolve();
                    users.map(u => chain = chain.then(() => {
                        joinUserToGroup(u, opts.groupId).catch(() => usersFailedGrouping.push(u));
                    }));
                    return chain;
                })
                .then(() => getGroupedUserCount(opts.groupId, usersPrefix))
                .then(count => afterGroupingUserCount = count);
        }

        if (!opts.skipRooms) {
            chain = chain.then(() => getJoinedRooms())
                .then(rooms => {
                    let chain = Promise.resolve();
                    rooms.map(r => chain = chain.then(() => {
                        tryAssociateRoom(r, opts.groupId).catch(() => roomsFailedAssociation.push(r));
                    }));
                    return chain;
                });
        }

        chain
            .then(() => db.end())
            .then(() => printGroupResults(beforeGroupingUserCount, afterGroupingUserCount, usersFailedGrouping, roomsFailedAssociation));
    });
};

function checkGroupExists(groupId) {
    return botClient.getGroupSummary(groupId).catch(() => {
        console.log("Creating group...");
        return botClient.createGroup({
            localpart: groupId.substring(1).split(':')[0],
            profile: {},
        });
    });
}

function getGroupedUserCount(groupId, usersPrefix) {
    let query = "select count(*) as num from group_users where group_users.user_id like $1 and group_users.group_id = $2";
    return db.query(query, [usersPrefix + "%", groupId]).then(result => result.rows[0].num);
}

function getUngroupedUsers(groupId, usersPrefix) {
    let query = "select users.name as userid from users where users.name not in (select group_users.user_id from group_users where group_users.user_id like $1 and group_users.group_id = $2) and users.name like $1";
    return db.query(query, [usersPrefix + "%", groupId]).then(result => result.rows.map(r => r.userid));
}

function joinUserToGroup(userId, groupId) {
    console.log("Adding " + userId + " to " + groupId);
    const userClient = factory.getClientAs(userId);
    return botClient.inviteUserToGroup(groupId, userId)
        .then(() => userClient.acceptGroupInvite(groupId))
        .then(() => userClient.setGroupPublicity(groupId, true));
}

function getJoinedRooms() {
    // const path = utils.encodeUri("/create_group");
    return botClient._http.authedRequestWithPrefix(undefined, "GET", "/joined_rooms", undefined, undefined, "/_matrix/client/r0")
        .then(response => {
            if (!response.joined_rooms) return [];
            return response.joined_rooms;
        });
}

function tryAssociateRoom(roomId, groupId) {
    return botClient.getStateEvent(roomId, "m.room.related_groups", "").catch(() => null).then(event => {
        let relatedGroups = [];
        if (event) relatedGroups = event.groups;
        if (relatedGroups.indexOf(groupId) === -1) {
            relatedGroups.push(groupId);
            return botClient.sendStateEvent(roomId, "m.room.related_groups", {groups: relatedGroups}, "");
        }
    });
}

function printGroupResults(beforeCount, afterCount, failedUserIds, failedRoomIds) {
    console.log("Grouping completed.");
    console.log("Users grouped before grouping:  " + beforeCount);
    console.log("Users grouped after grouping:   " + afterCount);
    console.log("Users failed to group:          " + failedUserIds.length);
    console.log("Rooms failed to associate:      " + failedRoomIds.length);
    if (failedUserIds.length > 0) {
        console.log("Failed users:\n\t" + failedUserIds.join("\n\t"));
    }
    if (failedRoomIds.length > 0) {
        console.log("Failed rooms:\n\t" + failedRoomIds.join("\n\t"));
    }
}