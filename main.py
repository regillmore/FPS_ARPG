from direct.showbase.ShowBase import ShowBase

class MyGame(ShowBase):
    def __init__(self):
        ShowBase.__init__(self)

game = MyGame()
game.run()