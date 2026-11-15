import XCTest

final class ThatTweetSafariUITests: XCTestCase {
    @MainActor
    func testChineseSetupContent() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 20))
        let heading = web.staticTexts["在 Safari 中使用 ThatTweet"]
        XCTAssertTrue(heading.waitForExistence(timeout: 20), app.debugDescription)

        let start = XCTAttachment(screenshot: app.screenshot())
        start.name = "中文启用说明"
        start.lifetime = .keepAlways
        add(start)

        let notice = web.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "iOS 可能暂停后台处理")).firstMatch
        for _ in 0..<5 {
            if notice.exists && notice.isHittable { break }
            web.swipeUp()
        }
        XCTAssertTrue(notice.exists && notice.isHittable, "The last setup paragraph must be reachable by scrolling")
        let bottom = XCTAttachment(screenshot: app.screenshot())
        bottom.name = "滚动到最后说明"
        bottom.lifetime = .keepAlways
        add(bottom)
    }
}
